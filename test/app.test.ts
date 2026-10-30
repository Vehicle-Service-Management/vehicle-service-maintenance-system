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

test("database initialization migrates existing service and customer tables", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT NOT NULL, address TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE services (id TEXT PRIMARY KEY, description TEXT NOT NULL, status TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  `);

  initializeDatabase(db);

  const customerColumns = (db.prepare("PRAGMA table_info(customers)").all() as Array<{ name: string }>).map(({ name }) => name);
  const serviceColumns = (db.prepare("PRAGMA table_info(services)").all() as Array<{ name: string }>).map(({ name }) => name);
  assert.ok(customerColumns.includes("user_id"));
  for (const column of [
    "vehicle_id",
    "service_type",
    "review_status",
    "reviewed_by",
    "reviewed_at",
    "rejection_reason",
    "assigned_to",
    "assigned_by",
    "assigned_at",
    "work_performed",
    "service_notes",
    "completed_at"
  ]) {
    assert.ok(serviceColumns.includes(column), `expected migrated services column ${column}`);
  }
  db.close();
});

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

function insertValidatedService(id = "service-request-1"): string {
  const now = new Date().toISOString();
  context.db.prepare(`
    INSERT INTO services (
      id, description, status, review_status, created_by, created_at, updated_at
    ) VALUES (?, ?, 'received', 'validated', ?, ?, ?)
  `).run(id, "Approved vehicle service", context.admin.id, now, now);
  return id;
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

test("administrators can edit staff accounts, reset passwords, and reactivate accounts", async () => {
  const app = createApp(context.db, secret);
  const created = await request(app).post("/api/admin/users")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({
      email: "editable-tech@example.com",
      displayName: "Editable Technician",
      password,
      role: "Service Technician"
    });
  const userId = created.body.user.id as string;

  const edited = await request(app).patch(`/api/admin/users/${userId}`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({
      email: "updated-tech@example.com",
      displayName: "Updated Technician",
      role: "Service Advisor",
      password: "updated password with enough length"
    });
  const oldPasswordLogin = await request(app).post("/api/auth/login")
    .send({ email: "updated-tech@example.com", password });
  const deactivate = await request(app).patch(`/api/admin/users/${userId}`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ isActive: false });
  const inactiveLogin = await request(app).post("/api/auth/login")
    .send({ email: "updated-tech@example.com", password: "updated password with enough length" });
  const reactivate = await request(app).patch(`/api/admin/users/${userId}`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ isActive: true });
  const activeLogin = await request(app).post("/api/auth/login")
    .send({ email: "updated-tech@example.com", password: "updated password with enough length" });

  assert.equal(created.status, 201);
  assert.equal(edited.status, 200);
  assert.equal(edited.body.user.email, "updated-tech@example.com");
  assert.equal(edited.body.user.displayName, "Updated Technician");
  assert.equal(edited.body.user.role, "Service Advisor");
  assert.equal("password" in edited.body.user, false);
  assert.equal(oldPasswordLogin.status, 401);
  assert.equal(deactivate.status, 200);
  assert.equal(inactiveLogin.status, 401);
  assert.equal(reactivate.status, 200);
  assert.equal(reactivate.body.user.isActive, true);
  assert.equal(activeLogin.status, 200);
  assert.equal(activeLogin.body.user.role, "Service Advisor");
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

test("customers can submit requests for their vehicles and advisors must validate before status work", async () => {
  const app = createApp(context.db, secret);
  const now = new Date().toISOString();
  const customerProfileId = "customer-record-service";
  const customerVehicleId = "vehicle-record-service";
  context.db.prepare(`
    INSERT INTO customers (id, name, email, phone, address, user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    customerProfileId,
    "Customer User",
    context.customer.email,
    "9876543210",
    null,
    context.customer.id,
    now,
    now
  );
  context.db.prepare(`
    INSERT INTO vehicles (
      id, customer_id, registration_number, make, model, year, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    customerVehicleId,
    customerProfileId,
    "KA01AB1234",
    "Toyota",
    "Corolla",
    2022,
    now,
    now
  );
  const unauthenticatedCreate = await request(app).post("/api/services")
    .send({ vehicleId: customerVehicleId, serviceType: "Inspection", description: "Brake inspection" });
  const created = await request(app).post("/api/services")
    .set("Authorization", `Bearer ${context.customerToken}`)
    .send({
      vehicleId: customerVehicleId,
      serviceType: "Inspection",
      description: "Brake inspection"
    });
  const review = await request(app).patch(`/api/services/${created.body.service.id}/review`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ decision: "validate" });
  const prematureStatus = await request(app).patch(`/api/services/${created.body.service.id}/status`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ status: "in_progress" });

  context.db.prepare("UPDATE services SET status = 'assigned' WHERE id = ?")
    .run(created.body.service.id);
  const changed = await request(app).patch(`/api/services/${created.body.service.id}/status`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ status: "in_progress" });
  const events = await request(app).get("/api/admin/audit-events")
    .set("Authorization", `Bearer ${context.adminToken}`);

  assert.equal(unauthenticatedCreate.status, 401);
  assert.equal(created.status, 201);
  assert.equal(created.body.service.status, "submitted");
  assert.equal(created.body.service.customerId, customerProfileId);
  assert.equal(review.status, 200);
  assert.equal(review.body.service.status, "validated");
  assert.equal(prematureStatus.status, 409);
  assert.equal(changed.body.service.status, "in_progress");
  const change = events.body.events.find((event: { action: string; targetId: string }) =>
    event.action === "service.status_changed" && event.targetId === created.body.service.id
  );
  assert.equal(change.actorUserId, context.admin.id);
  assert.equal(change.details.from, "assigned");
  assert.equal(change.details.to, "in_progress");
});

test("incomplete requests stay submitted until corrected and pass advisor review", async () => {
  const app = createApp(context.db, secret);
  const now = new Date().toISOString();
  const customerId = "customer-record-incomplete";
  const vehicleId = "vehicle-record-incomplete";
  context.db.prepare(`
    INSERT INTO customers (id, name, email, phone, address, user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(customerId, "Customer User", context.customer.email, "9876543210", null, context.customer.id, now, now);
  context.db.prepare(`
    INSERT INTO vehicles (
      id, customer_id, registration_number, make, model, year, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(vehicleId, customerId, "KA02CD4567", "Honda", "City", 2021, now, now);

  const submitted = await request(app).post("/api/services")
    .set("Authorization", `Bearer ${context.customerToken}`)
    .send({ vehicleId, description: "Inspect the brakes" });
  const invalidReview = await request(app).patch(`/api/services/${submitted.body.service.id}/review`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ decision: "validate" });
  const submissionList = await request(app).get("/api/services?status=submitted")
    .set("Authorization", `Bearer ${context.adminToken}`);
  const corrected = await request(app).patch(`/api/services/${submitted.body.service.id}`)
    .set("Authorization", `Bearer ${context.customerToken}`)
    .send({ serviceType: "Brake inspection" });
  const review = await request(app).patch(`/api/services/${submitted.body.service.id}/review`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ decision: "validate" });

  assert.equal(submitted.status, 201);
  assert.equal(submitted.body.service.status, "submitted");
  assert.equal(invalidReview.status, 400);
  assert.equal(invalidReview.body.details[0].path, "serviceType");
  assert.equal(submissionList.status, 200);
  assert.equal(submissionList.body.total, 1);
  assert.equal(submissionList.body.services[0].id, submitted.body.service.id);
  assert.equal(corrected.status, 200);
  assert.equal(corrected.body.service.status, "submitted");
  assert.equal(review.status, 200);
  assert.equal(review.body.service.status, "validated");
});

test("advisors can reject with a reason and customers can correct and resubmit", async () => {
  const app = createApp(context.db, secret);
  const now = new Date().toISOString();
  const customerId = "customer-record-rejected";
  const vehicleId = "vehicle-record-rejected";
  context.db.prepare(`
    INSERT INTO customers (id, name, email, phone, address, user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(customerId, "Customer User", context.customer.email, "9876543210", null, context.customer.id, now, now);
  context.db.prepare(`
    INSERT INTO vehicles (
      id, customer_id, registration_number, make, model, year, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(vehicleId, customerId, "KA03EF8910", "Suzuki", "Swift", 2020, now, now);
  const created = await request(app).post("/api/services")
    .set("Authorization", `Bearer ${context.customerToken}`)
    .send({ vehicleId, serviceType: "Repair", description: "Engine noise" });
  const noReason = await request(app).patch(`/api/services/${created.body.service.id}/review`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ decision: "reject" });
  const rejected = await request(app).patch(`/api/services/${created.body.service.id}/review`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ decision: "reject", reason: "Please provide the current odometer reading" });
  const resubmitted = await request(app).patch(`/api/services/${created.body.service.id}`)
    .set("Authorization", `Bearer ${context.customerToken}`)
    .send({ description: "Engine noise; odometer is 42,000 km" });
  const validated = await request(app).patch(`/api/services/${created.body.service.id}/review`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ decision: "validate" });

  assert.equal(created.status, 201);
  assert.equal(noReason.status, 400);
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.service.status, "rejected");
  assert.equal(rejected.body.service.rejectionReason, "Please provide the current odometer reading");
  assert.equal(resubmitted.status, 200);
  assert.equal(resubmitted.body.service.status, "submitted");
  assert.equal(resubmitted.body.service.rejectionReason, null);
  assert.equal(validated.status, 200);
  assert.equal(validated.body.service.status, "validated");
});

test("administrators link customer accounts to existing customer records", async () => {
  const app = createApp(context.db, secret);
  const customer = await request(app).post("/api/customers")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ name: "New Customer", email: "new-customer@example.com", phone: "9876543211" });
  const unlinked = await request(app).post("/api/admin/users")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({
      email: "new-customer-login@example.com",
      displayName: "New Customer",
      password,
      role: "Customer"
    });
  const linked = await request(app).post("/api/admin/users")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({
      email: "new-customer-login@example.com",
      displayName: "New Customer",
      password,
      role: "Customer",
      customerId: customer.body.customer.id
    });
  const customerToken = createToken({
    id: linked.body.user.id,
    email: linked.body.user.email,
    displayName: linked.body.user.displayName,
    role: "Customer"
  }, secret);
  const vehicle = await request(app).post("/api/vehicles")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({
      customerId: customer.body.customer.id,
      registrationNumber: "KA04GH2345",
      make: "Hyundai",
      model: "i20",
      year: 2023
    });
  const ownRequest = await request(app).post("/api/services")
    .set("Authorization", `Bearer ${customerToken}`)
    .send({ vehicleId: vehicle.body.vehicle.id, serviceType: "Oil change", description: "Routine service" });
  const duplicateAccount = await request(app).post("/api/admin/users")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({
      email: "duplicate-customer-login@example.com",
      displayName: "Duplicate Customer",
      password,
      role: "Customer",
      customerId: customer.body.customer.id
    });
  const otherCustomer = await request(app).post("/api/customers")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ name: "Other Customer", email: "other-customer@example.com", phone: "9876543212" });
  const otherVehicle = await request(app).post("/api/vehicles")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({
      customerId: otherCustomer.body.customer.id,
      registrationNumber: "KA05IJ6789",
      make: "Tata",
      model: "Nexon",
      year: 2024
    });
  const otherCustomerRequest = await request(app).post("/api/services")
    .set("Authorization", `Bearer ${customerToken}`)
    .send({ vehicleId: otherVehicle.body.vehicle.id, serviceType: "Inspection", description: "Not owned" });
  const ownList = await request(app).get("/api/services")
    .set("Authorization", `Bearer ${customerToken}`);

  assert.equal(customer.status, 201);
  assert.equal(unlinked.status, 400);
  assert.equal(linked.status, 201);
  assert.equal(linked.body.user.customerId, customer.body.customer.id);
  assert.equal(ownRequest.status, 201);
  assert.equal(ownRequest.body.service.customerId, customer.body.customer.id);
  assert.equal(duplicateAccount.status, 409);
  assert.equal(otherCustomer.status, 201);
  assert.equal(otherVehicle.status, 201);
  assert.equal(otherCustomerRequest.status, 403);
  assert.equal(ownList.status, 200);
  assert.equal(ownList.body.total, 1);
});

test("login returns a bearer token and rejects invalid passwords", async () => {
  const app = createApp(context.db, secret);
  const valid = await request(app).post("/api/auth/login")
    .send({ email: context.admin.email, password     });
  const invalid = await request(app).post("/api/auth/login")
    .send({ email: context.admin.email, password: "not-the-password" });
  const oversizedPassword = await request(app).post("/api/auth/login")
    .send({ email: context.admin.email, password: "x".repeat(73) });

  assert.equal(valid.status, 200);
  assert.equal(valid.body.tokenType, "Bearer");
  assert.equal(invalid.status, 401);
  assert.equal(oversizedPassword.status, 400);
});

test("authorized staff can assign only validated requests to active technicians", async () => {
  const app = createApp(context.db, secret);
  const technician = await request(app).post("/api/admin/users")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({
      email: "workshop-tech@example.com",
      displayName: "Workshop Technician",
      password,
      role: "Service Technician"
    });
  const unapproved = new Date().toISOString();
  context.db.prepare(`
    INSERT INTO services (
      id, description, status, review_status, created_by, created_at, updated_at
    ) VALUES ('submitted-service', 'Awaiting review', 'received', 'submitted', ?, ?, ?)
  `).run(context.admin.id, unapproved, unapproved);
  const waitingId = insertValidatedService();
  const submittedAssignment = await request(app).post("/api/services/submitted-service/assign")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ technicianUserId: technician.body.user.id });

  const customerQueue = await request(app).get("/api/services/awaiting-assignment")
    .set("Authorization", `Bearer ${context.customerToken}`);
  const queue = await request(app).get("/api/services/awaiting-assignment")
    .set("Authorization", `Bearer ${context.adminToken}`);
  const technicianList = await request(app).get("/api/technicians")
    .set("Authorization", `Bearer ${context.adminToken}`);
  const badRoleAssignment = await request(app).post(`/api/services/${waitingId}/assign`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ technicianUserId: context.customer.id });
  const assigned = await request(app).post(`/api/services/${waitingId}/assign`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ technicianUserId: technician.body.user.id });
  const duplicate = await request(app).post(`/api/services/${waitingId}/assign`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ technicianUserId: technician.body.user.id });
  const audits = context.db.prepare(`
    SELECT action, actor_user_id AS actorUserId, details_json AS detailsJson
    FROM audit_events WHERE target_id = ?
  `).all(waitingId) as Array<{ action: string; actorUserId: string; detailsJson: string }>;

  assert.equal(technician.status, 201);
  assert.equal(customerQueue.status, 403);
  assert.equal(queue.status, 200);
  assert.equal(queue.body.total, 1);
  assert.equal(queue.body.services[0].id, waitingId);
  assert.equal(technicianList.status, 200);
  assert.equal(technicianList.body.total, 1);
  assert.equal(technicianList.body.technicians[0].activeAssignments, 0);
  assert.equal(submittedAssignment.status, 409);
  assert.equal(badRoleAssignment.status, 400);
  assert.equal(assigned.status, 200);
  assert.equal(assigned.body.service.status, "assigned");
  assert.equal(assigned.body.service.assignedTo, technician.body.user.id);
  assert.equal(assigned.body.service.assignedBy, context.admin.id);
  assert.equal(assigned.body.service.assignedTechnicianName, "Workshop Technician");
  assert.equal(Number.isNaN(Date.parse(assigned.body.service.assignedAt)), false);
  assert.equal(duplicate.status, 409);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, "service.assigned");
  assert.equal(audits[0].actorUserId, context.admin.id);
  assert.equal(JSON.parse(audits[0].detailsJson).assignedTo, technician.body.user.id);
});

test("technicians see and update only their own approved service assignments", async () => {
  const app = createApp(context.db, secret);
  const firstTech = await request(app).post("/api/admin/users")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ email: "first-tech@example.com", displayName: "First Tech", password, role: "Service Technician" });
  const secondTech = await request(app).post("/api/admin/users")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ email: "second-tech@example.com", displayName: "Second Tech", password, role: "Service Technician" });
  const firstId = insertValidatedService("first-work");
  const secondId = insertValidatedService("second-work");
  for (const [serviceId, userId] of [
    [firstId, firstTech.body.user.id],
    [secondId, secondTech.body.user.id]
  ]) {
    await request(app).post(`/api/services/${serviceId}/assign`)
      .set("Authorization", `Bearer ${context.adminToken}`)
      .send({ technicianUserId: userId });
  }
  const token = createToken({
    id: firstTech.body.user.id,
    email: firstTech.body.user.email,
    displayName: firstTech.body.user.displayName,
    role: "Service Technician"
  }, secret);

  const ownWork = await request(app).get("/api/services/assigned")
    .set("Authorization", `Bearer ${token}`);
  const otherWork = await request(app).get(`/api/services/${secondId}`)
    .set("Authorization", `Bearer ${token}`);
  const unauthorizedUpdate = await request(app).patch(`/api/services/${secondId}/execution`)
    .set("Authorization", `Bearer ${token}`)
    .send({ workPerformed: "Wrong technician" });
  const started = await request(app).patch(`/api/services/${firstId}/execution`)
    .set("Authorization", `Bearer ${token}`)
    .send({ workPerformed: "Replaced the oil filter.", notes: "Used OEM parts.", status: "in_progress" });

  assert.equal(ownWork.status, 200);
  assert.equal(ownWork.body.total, 1);
  assert.equal(ownWork.body.services[0].id, firstId);
  assert.equal(otherWork.status, 404);
  assert.equal(unauthorizedUpdate.status, 403);
  assert.equal(started.status, 200);
  assert.equal(started.body.service.workPerformed, "Replaced the oil filter.");
  assert.equal(started.body.service.notes, "Used OEM parts.");
  assert.equal(started.body.service.status, "in_progress");
});

test("completion requires recorded work, stores completion time, audits activity, and locks the service", async () => {
  const app = createApp(context.db, secret);
  const technician = await request(app).post("/api/admin/users")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ email: "completion-tech@example.com", displayName: "Completion Tech", password, role: "Service Technician" });
  const serviceId = insertValidatedService("completion-service");
  await request(app).post(`/api/services/${serviceId}/assign`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ technicianUserId: technician.body.user.id });
  const token = createToken({
    id: technician.body.user.id,
    email: technician.body.user.email,
    displayName: technician.body.user.displayName,
    role: "Service Technician"
  }, secret);

  const startedWithoutWork = await request(app).patch(`/api/services/${serviceId}/execution`)
    .set("Authorization", `Bearer ${token}`)
    .send({ status: "in_progress" });
  const missingWork = await request(app).patch(`/api/services/${serviceId}/execution`)
    .set("Authorization", `Bearer ${token}`)
    .send({ status: "completed" });
  await request(app).patch(`/api/services/${serviceId}/execution`)
    .set("Authorization", `Bearer ${token}`)
    .send({ workPerformed: "Repaired the cooling system." });
  const completed = await request(app).patch(`/api/services/${serviceId}/execution`)
    .set("Authorization", `Bearer ${token}`)
    .send({ notes: "Road tested successfully.", status: "completed" });
  const editCompleted = await request(app).patch(`/api/services/${serviceId}/execution`)
    .set("Authorization", `Bearer ${token}`)
    .send({ notes: "Attempted post-completion edit." });
  const audit = context.db.prepare(`
    SELECT action, details_json AS detailsJson
    FROM audit_events WHERE target_id = ? AND action = 'service.completed'
  `).get(serviceId) as { action: string; detailsJson: string } | undefined;

  assert.equal(missingWork.status, 400);
  assert.equal(startedWithoutWork.status, 200);
  assert.equal(completed.status, 200);
  assert.equal(completed.body.service.status, "completed");
  assert.equal(completed.body.service.workPerformed, "Repaired the cooling system.");
  assert.equal(Number.isNaN(Date.parse(completed.body.service.completedAt)), false);
  assert.equal(editCompleted.status, 409);
  assert.equal(audit?.action, "service.completed");
  assert.equal(JSON.parse(audit!.detailsJson).completedAt, completed.body.service.completedAt);
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

test("customers can list only vehicles linked to their own profile", async () => {
  const app = createApp(context.db, secret);
  const now = new Date().toISOString();
  const customerRows = context.db.prepare(`
    INSERT INTO customers (id, name, email, phone, user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const vehicleRows = context.db.prepare(`
    INSERT INTO vehicles (
      id, customer_id, registration_number, make, model, year, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  customerRows.run("own-profile", "Customer User", context.customer.email, "9876543210", context.customer.id, now, now);
  customerRows.run("other-profile", "Other Customer", "other@example.com", "9876543211", null, now, now);
  vehicleRows.run("own-car", "own-profile", "KA10AA1001", "Honda", "City", 2021, now, now);
  vehicleRows.run("other-car", "other-profile", "KA10AA1002", "Tata", "Nexon", 2022, now, now);

  const ownVehicles = await request(app)
    .get("/api/me/vehicles")
    .set("Authorization", `Bearer ${context.customerToken}`);
  const forbiddenStaffAccess = await request(app)
    .get("/api/me/vehicles")
    .set("Authorization", `Bearer ${context.adminToken}`);

  assert.equal(ownVehicles.status, 200);
  assert.equal(ownVehicles.body.total, 1);
  assert.deepEqual(ownVehicles.body.vehicles.map((vehicle: { id: string }) => vehicle.id), ["own-car"]);
  assert.equal(forbiddenStaffAccess.status, 403);
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
