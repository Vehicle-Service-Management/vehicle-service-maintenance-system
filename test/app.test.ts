import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import Database from "better-sqlite3";
import request from "supertest";
import { createApp } from "../src/app";
import { createToken, hashPassword } from "../src/auth";
import { initializeDatabase, type AppDatabase } from "../src/db";
import type { AuthenticatedUser } from "../src/types";

const secret = "test-only-secret-with-at-least-32-characters";
const password = "correct horse battery staple";

interface TestContext {
  db: AppDatabase;
  admin: AuthenticatedUser;
  adminToken: string;
  customer: AuthenticatedUser;
  customerToken: string;
}

let context: TestContext;

beforeEach(async () => {
  const db = new Database(":memory:");
  initializeDatabase(db);
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  const admin: AuthenticatedUser = {
    id: "admin-1",
    email: "admin@example.com",
    displayName: "Admin User",
    role: "Administrator"
  };
  const customer: AuthenticatedUser = {
    id: "customer-1",
    email: "customer@example.com",
    displayName: "Customer User",
    role: "Customer"
  };
  const insert = db.prepare(`
    INSERT INTO users (id, email, display_name, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run(admin.id, admin.email, admin.displayName, passwordHash, admin.role, now, now);
  insert.run(customer.id, customer.email, customer.displayName, passwordHash, customer.role, now, now);
  context = {
    db,
    admin,
    adminToken: createToken(admin, secret),
    customer,
    customerToken: createToken(customer, secret)
  };
});

afterEach(() => context.db.close());

function adminRequest(): request.Test {
  return request(createApp(context.db, secret)).get("/api/admin/users")
    .set("Authorization", `Bearer ${context.adminToken}`);
}

test("admin-only routes reject unauthenticated and non-admin users", async () => {
  const app = createApp(context.db, secret);
  const unauthenticated = await request(app).get("/api/admin/users");
  const forbiddenUsers = await request(app).get("/api/admin/users")
    .set("Authorization", `Bearer ${context.customerToken}`);
  const forbiddenAudit = await request(app).get("/api/admin/audit-events")
    .set("Authorization", `Bearer ${context.customerToken}`);

  assert.equal(unauthenticated.status, 401);
  assert.equal(forbiddenUsers.status, 403);
  assert.equal(forbiddenAudit.status, 403);
});

test("administrators can create and list users without exposing password hashes", async () => {
  const app = createApp(context.db, secret);
  const created = await request(app).post("/api/admin/users")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({
      email: "technician@example.com",
      displayName: "Service Technician",
      password,
      role: "Service Technician"
    });
  const listed = await adminRequest();

  assert.equal(created.status, 201);
  assert.equal(created.body.user.role, "Service Technician");
  assert.equal("password" in created.body.user, false);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.total, 3);
  assert.equal(JSON.stringify(listed.body).includes("password_hash"), false);
});

test("administrators can change roles and deactivate users; changes take effect for existing tokens", async () => {
  const app = createApp(context.db, secret);
  const update = await request(app).patch(`/api/admin/users/${context.customer.id}`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ role: "Service Advisor", isActive: false });
  const login = await request(app).post("/api/auth/login")
    .send({ email: context.customer.email, password });
  const userList = await request(app).get("/api/admin/users")
    .set("Authorization", `Bearer ${context.customerToken}`);

  assert.equal(update.status, 200);
  assert.equal(update.body.user.role, "Service Advisor");
  assert.equal(update.body.user.isActive, false);
  assert.equal(login.status, 401);
  assert.equal(userList.status, 401);
});

test("prevents self-demotion and preserves one active administrator on account deactivation", async () => {
  const app = createApp(context.db, secret);
  const selfUpdate = await request(app).patch(`/api/admin/users/${context.admin.id}`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ role: "Customer" });
  const secondAdmin = await request(app).post("/api/admin/users")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ email: "second-admin@example.com", displayName: "Second Admin", password, role: "Administrator" });
  const secondAdminToken = createToken({
    id: secondAdmin.body.user.id,
    email: secondAdmin.body.user.email,
    displayName: secondAdmin.body.user.displayName,
    role: "Administrator"
  }, secret);
  const secondAdminUpdate = await request(app).patch(`/api/admin/users/${context.admin.id}`)
    .set("Authorization", `Bearer ${secondAdminToken}`)
    .send({ isActive: false });

  assert.equal(selfUpdate.status, 400);
  assert.equal(secondAdminUpdate.status, 200);
  assert.equal(secondAdminUpdate.body.user.isActive, false);
  assert.equal((context.db.prepare(`
    SELECT COUNT(*) AS count FROM users WHERE role = 'Administrator' AND is_active = 1
  `).get() as { count: number }).count, 1);
});

test("audit events capture actors and details and cannot be updated or deleted", async () => {
  const app = createApp(context.db, secret);
  const created = await request(app).post("/api/admin/users")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ email: "advisor@example.com", displayName: "Advisor", password, role: "Service Advisor" });
  const events = await request(app).get("/api/admin/audit-events")
    .set("Authorization", `Bearer ${context.adminToken}`);

  assert.equal(created.status, 201);
  assert.equal(events.status, 200);
  assert.equal(events.body.total, 1);
  assert.equal(events.body.events[0].actorUserId, context.admin.id);
  assert.equal(events.body.events[0].actorRole, "Administrator");
  assert.equal(events.body.events[0].action, "user.created");
  assert.equal(events.body.events[0].details.role, "Service Advisor");
  assert.equal(Number.isNaN(Date.parse(events.body.events[0].createdAt)), false);
  assert.equal(JSON.stringify(events.body).includes(password), false);

  assert.throws(
    () => context.db.prepare("UPDATE audit_events SET action = 'changed'").run(),
    /audit events are immutable/
  );
  assert.throws(
    () => context.db.prepare("DELETE FROM audit_events").run(),
    /audit events are immutable/
  );
});

test("service status changes are role-restricted and audited with before/after values", async () => {
  const app = createApp(context.db, secret);
  const unauthorizedCreate = await request(app).post("/api/services")
    .set("Authorization", `Bearer ${context.customerToken}`)
    .send({ description: "Brake inspection" });
  const created = await request(app).post("/api/services")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ description: "Brake inspection" });
  const changed = await request(app).patch(`/api/services/${created.body.service.id}/status`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ status: "in_progress" });
  const events = await request(app).get("/api/admin/audit-events")
    .set("Authorization", `Bearer ${context.adminToken}`);

  assert.equal(unauthorizedCreate.status, 403);
  assert.equal(created.status, 201);
  assert.equal(changed.body.service.status, "in_progress");
  const change = events.body.events.find((event: { action: string }) => event.action === "service.status_changed");
  assert.equal(change.actorUserId, context.admin.id);
  assert.equal(change.details.from, "received");
  assert.equal(change.details.to, "in_progress");
});

test("login returns a bearer token and rejects invalid passwords", async () => {
  const app = createApp(context.db, secret);
  const valid = await request(app).post("/api/auth/login")
    .send({ email: context.admin.email, password });
  const invalid = await request(app).post("/api/auth/login")
    .send({ email: context.admin.email, password: "not-the-password" });
  const oversizedPassword = await request(app).post("/api/auth/login")
    .send({ email: context.admin.email, password: "x".repeat(73) });

  assert.equal(valid.status, 200);
  assert.equal(valid.body.tokenType, "Bearer");
  assert.equal(invalid.status, 401);
  assert.equal(oversizedPassword.status, 400);
});

test("rejects invalid user roles and malformed user updates", async () => {
  const app = createApp(context.db, secret);
  const invalidRole = await request(app).post("/api/admin/users")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ email: "invalid@example.com", displayName: "Invalid", password, role: "Owner" });
  const emptyUpdate = await request(app).patch(`/api/admin/users/${context.customer.id}`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({});

  assert.equal(invalidRole.status, 400);
  assert.equal(emptyUpdate.status, 400);
});
test("service advisors can register and list customers", async () => {
  const app = createApp(context.db, secret);

  const advisor = await request(app)
    .post("/api/admin/users")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({
      email: "advisor@example.com",
      displayName: "Service Advisor",
      password,
      role: "Service Advisor"
    });

  assert.equal(advisor.status, 201);

  const advisorToken = createToken(
    {
      id: advisor.body.user.id,
      email: advisor.body.user.email,
      displayName: advisor.body.user.displayName,
      role: "Service Advisor"
    },
    secret
  );

  const created = await request(app)
    .post("/api/customers")
    .set("Authorization", `Bearer ${advisorToken}`)
    .send({
      name: "Priya Sharma",
      email: "priya.sharma@example.com",
      phone: "9876543210",
      address: "Bengaluru"
    });

  assert.equal(created.status, 201);
  assert.equal(created.body.customer.name, "Priya Sharma");
  assert.equal(created.body.customer.email, "priya.sharma@example.com");
  assert.equal(created.body.customer.phone, "9876543210");
  assert.equal(created.body.customer.address, "Bengaluru");
  assert.ok(created.body.customer.id);

  const listed = await request(app)
    .get("/api/customers")
    .set("Authorization", `Bearer ${advisorToken}`);

  assert.equal(listed.status, 200);
  assert.equal(listed.body.total, 1);
  assert.equal(
    listed.body.customers[0].id,
    created.body.customer.id
  );
});

test("customer registration rejects invalid and duplicate details", async () => {
  const app = createApp(context.db, secret);

  const headers = {
    Authorization: `Bearer ${context.adminToken}`
  };

  const missingFields = await request(app)
    .post("/api/customers")
    .set(headers)
    .send({
      name: "",
      email: "not-an-email",
      phone: ""
    });

  assert.equal(missingFields.status, 400);

  const first = await request(app)
    .post("/api/customers")
    .set(headers)
    .send({
      name: "Alex Morgan",
      email: "alex@example.com",
      phone: "9876543210"
    });

  assert.equal(first.status, 201);

  const duplicate = await request(app)
    .post("/api/customers")
    .set(headers)
    .send({
      name: "Another Alex",
      email: "ALEX@example.com",
      phone: "9876543211"
    });

  assert.equal(duplicate.status, 409);
});

test("customers can be viewed and updated by authorized users", async () => {
  const app = createApp(context.db, secret);

  const headers = {
    Authorization: `Bearer ${context.adminToken}`
  };

  const created = await request(app)
    .post("/api/customers")
    .set(headers)
    .send({
      name: "Jordan Lee",
      email: "jordan@example.com",
      phone: "9876543210"
    });

  assert.equal(created.status, 201);

  const customerId = created.body.customer.id;

  const viewed = await request(app)
    .get(`/api/customers/${customerId}`)
    .set(headers);

  assert.equal(viewed.status, 200);
  assert.equal(viewed.body.customer.name, "Jordan Lee");

  const updated = await request(app)
    .patch(`/api/customers/${customerId}`)
    .set(headers)
    .send({
      name: "Jordan Lee Updated",
      phone: "9123456780"
    });

  assert.equal(updated.status, 200);
  assert.equal(updated.body.customer.name, "Jordan Lee Updated");
  assert.equal(updated.body.customer.phone, "9123456780");
  assert.equal(updated.body.customer.email, "jordan@example.com");

  const missing = await request(app)
    .get("/api/customers/does-not-exist")
    .set(headers);

  assert.equal(missing.status, 404);
});

test("customer routes reject unauthorized access", async () => {
  const app = createApp(context.db, secret);

  const unauthenticated = await request(app)
    .get("/api/customers");

  const customerRoleRequest = await request(app)
    .get("/api/customers")
    .set("Authorization", `Bearer ${context.customerToken}`);

  const forbiddenCreate = await request(app)
    .post("/api/customers")
    .set("Authorization", `Bearer ${context.customerToken}`)
    .send({
      name: "Unauthorized User",
      email: "unauthorized@example.com",
      phone: "9876543210"
    });

  assert.equal(unauthenticated.status, 401);
  assert.equal(customerRoleRequest.status, 403);
  assert.equal(forbiddenCreate.status, 403);
});
test("service advisors can register vehicles for existing customers", async () => {
  const app = createApp(context.db, secret);

  const advisor = await request(app)
    .post("/api/admin/users")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({
      email: "vehicle-advisor@example.com",
      displayName: "Vehicle Advisor",
      password,
      role: "Service Advisor"
    });

  assert.equal(advisor.status, 201);

  const advisorToken = createToken(
    {
      id: advisor.body.user.id,
      email: advisor.body.user.email,
      displayName: advisor.body.user.displayName,
      role: "Service Advisor"
    },
    secret
  );

  const customer = await request(app)
    .post("/api/customers")
    .set("Authorization", `Bearer ${advisorToken}`)
    .send({
      name: "Alex Morgan",
      email: "alex.morgan@example.com",
      phone: "9876543210"
    });

  assert.equal(customer.status, 201);

  const created = await request(app)
    .post("/api/vehicles")
    .set("Authorization", `Bearer ${advisorToken}`)
    .send({
      customerId: customer.body.customer.id,
      registrationNumber: "KA01AB1234",
      make: "Toyota",
      model: "Corolla",
      year: 2022
    });

  assert.equal(created.status, 201);
  assert.equal(created.body.vehicle.registrationNumber, "KA01AB1234");
  assert.equal(created.body.vehicle.make, "Toyota");
  assert.equal(created.body.vehicle.model, "Corolla");
  assert.equal(created.body.vehicle.year, 2022);
  assert.equal(
    created.body.vehicle.customerId,
    customer.body.customer.id
  );
});

test("vehicle registration rejects invalid details and duplicate registration numbers", async () => {
  const app = createApp(context.db, secret);

  const headers = {
    Authorization: `Bearer ${context.adminToken}`
  };

  const customer = await request(app)
    .post("/api/customers")
    .set(headers)
    .send({
      name: "Jordan Lee",
      email: "jordan.lee@example.com",
      phone: "9876543210"
    });

  assert.equal(customer.status, 201);

  const customerId = customer.body.customer.id;

  const invalid = await request(app)
    .post("/api/vehicles")
    .set(headers)
    .send({
      customerId,
      registrationNumber: "",
      make: "",
      model: "Corolla",
      year: 1800
    });

  assert.equal(invalid.status, 400);

  const missingCustomer = await request(app)
    .post("/api/vehicles")
    .set(headers)
    .send({
      customerId: "nonexistent-customer",
      registrationNumber: "KA01AB1234",
      make: "Toyota",
      model: "Corolla",
      year: 2022
    });

  assert.equal(missingCustomer.status, 404);

  const first = await request(app)
    .post("/api/vehicles")
    .set(headers)
    .send({
      customerId,
      registrationNumber: "KA01AB1234",
      make: "Toyota",
      model: "Corolla",
      year: 2022
    });

  assert.equal(first.status, 201);

  const duplicate = await request(app)
    .post("/api/vehicles")
    .set(headers)
    .send({
      customerId,
      registrationNumber: "ka01ab1234",
      make: "Honda",
      model: "City",
      year: 2023
    });

  assert.equal(duplicate.status, 409);
});

test("authorized users can list, view, and update customer vehicles", async () => {
  const app = createApp(context.db, secret);

  const headers = {
    Authorization: `Bearer ${context.adminToken}`
  };

  const customer = await request(app)
    .post("/api/customers")
    .set(headers)
    .send({
      name: "Sam Taylor",
      email: "sam.taylor@example.com",
      phone: "9876543210"
    });

  assert.equal(customer.status, 201);

  const customerId = customer.body.customer.id;

  const created = await request(app)
    .post("/api/vehicles")
    .set(headers)
    .send({
      customerId,
      registrationNumber: "KA03CD5678",
      make: "Honda",
      model: "City",
      year: 2021
    });

  assert.equal(created.status, 201);

  const vehicleId = created.body.vehicle.id;

  const listed = await request(app)
    .get(`/api/customers/${customerId}/vehicles`)
    .set(headers);

  assert.equal(listed.status, 200);
  assert.equal(listed.body.total, 1);
  assert.equal(listed.body.vehicles[0].id, vehicleId);

  const viewed = await request(app)
    .get(`/api/vehicles/${vehicleId}`)
    .set(headers);

  assert.equal(viewed.status, 200);
  assert.equal(viewed.body.vehicle.model, "City");

  const updated = await request(app)
    .patch(`/api/vehicles/${vehicleId}`)
    .set(headers)
    .send({
      model: "City ZX",
      year: 2023
    });

  assert.equal(updated.status, 200);
  assert.equal(updated.body.vehicle.model, "City ZX");
  assert.equal(updated.body.vehicle.year, 2023);

  const missing = await request(app)
    .get("/api/vehicles/nonexistent-vehicle")
    .set(headers);

  assert.equal(missing.status, 404);
});

test("vehicle routes reject unauthorized access", async () => {
  const app = createApp(context.db, secret);

  const unauthenticated = await request(app)
    .get("/api/vehicles/nonexistent-vehicle");

  const forbidden = await request(app)
    .post("/api/vehicles")
    .set("Authorization", `Bearer ${context.customerToken}`)
    .send({
      customerId: "customer-1",
      registrationNumber: "KA05EF9012",
      make: "Toyota",
      model: "Innova",
      year: 2024
    });

  assert.equal(unauthenticated.status, 401);
  assert.equal(forbidden.status, 403);
});