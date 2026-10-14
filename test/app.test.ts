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
  technician: AuthenticatedUser;
  technicianToken: string;
  otherTechnician: AuthenticatedUser;
  otherTechnicianToken: string;
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
  const technician: AuthenticatedUser = {
    id: "20000000-0000-4000-8000-000000000001",
    email: "new-technician@example.com",
    displayName: "Assigned Technician",
    role: "Service Technician"
  };
  const otherTechnician: AuthenticatedUser = {
    id: "20000000-0000-4000-8000-000000000002",
    email: "other-technician@example.com",
    displayName: "Other Technician",
    role: "Service Technician"
  };
  const insert = db.prepare(`
    INSERT INTO users (id, email, display_name, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run(admin.id, admin.email, admin.displayName, passwordHash, admin.role, now, now);
  insert.run(customer.id, customer.email, customer.displayName, passwordHash, customer.role, now, now);
  insert.run(technician.id, technician.email, technician.displayName, passwordHash, technician.role, now, now);
  insert.run(otherTechnician.id, otherTechnician.email, otherTechnician.displayName, passwordHash, otherTechnician.role, now, now);
  context = {
    db,
    admin,
    adminToken: createToken(admin, secret),
    customer,
    customerToken: createToken(customer, secret),
    technician,
    technicianToken: createToken(technician, secret),
    otherTechnician,
    otherTechnicianToken: createToken(otherTechnician, secret)
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
  assert.equal(listed.body.total, 5);
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
  await request(app).post(`/api/services/${created.body.service.id}/assign`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ technicianUserId: context.technician.id });
  const changed = await request(app).patch(`/api/services/${created.body.service.id}/status`)
    .set("Authorization", `Bearer ${context.technicianToken}`)
    .send({ status: "in_progress" });
  const events = await request(app).get("/api/admin/audit-events")
    .set("Authorization", `Bearer ${context.adminToken}`);

  assert.equal(unauthorizedCreate.status, 403);
  assert.equal(created.status, 201);
  assert.equal(changed.body.service.status, "in_progress");
  const change = events.body.events.find((event: { action: string }) => event.action === "service.status_changed");
  assert.equal(change.actorUserId, context.technician.id);
  assert.equal(change.details.from, "assigned");
  assert.equal(change.details.to, "in_progress");
});

test("service advisors assign active technicians and technicians see only their active assignments", async () => {
  const app = createApp(context.db, secret);
  const created = await request(app).post("/api/services")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ description: "Replace front brake pads" });
  const forbiddenAssignment = await request(app).post(`/api/services/${created.body.service.id}/assign`)
    .set("Authorization", `Bearer ${context.technicianToken}`)
    .send({ technicianUserId: context.technician.id });
  const assigned = await request(app).post(`/api/services/${created.body.service.id}/assign`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ technicianUserId: context.technician.id });
  const ownAssignments = await request(app).get("/api/services/assigned")
    .set("Authorization", `Bearer ${context.technicianToken}`);
  const otherAssignments = await request(app).get("/api/services/assigned")
    .set("Authorization", `Bearer ${context.otherTechnicianToken}`);
  const wrongTechnicianUpdate = await request(app).patch(`/api/services/${created.body.service.id}/execution`)
    .set("Authorization", `Bearer ${context.otherTechnicianToken}`)
    .send({ workPerformed: "Unauthorized work" });

  assert.equal(forbiddenAssignment.status, 403);
  assert.equal(assigned.status, 200);
  assert.equal(assigned.body.service.status, "assigned");
  assert.equal(assigned.body.service.assignedTechnicianName, context.technician.displayName);
  assert.equal(ownAssignments.body.total, 1);
  assert.equal(ownAssignments.body.services[0].id, created.body.service.id);
  assert.equal(otherAssignments.body.total, 0);
  assert.equal(wrongTechnicianUpdate.status, 403);
});

test("assigned technicians record work and notes, advance status, and complete the service with a timestamp", async () => {
  const app = createApp(context.db, secret);
  const created = await request(app).post("/api/services")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ description: "Replace front brake pads" });
  const serviceId = created.body.service.id as string;
  await request(app).post(`/api/services/${serviceId}/assign`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ technicianUserId: context.technician.id });
  const missingWork = await request(app).patch(`/api/services/${serviceId}/status`)
    .set("Authorization", `Bearer ${context.technicianToken}`)
    .send({ status: "completed" });
  const progress = await request(app).patch(`/api/services/${serviceId}/execution`)
    .set("Authorization", `Bearer ${context.technicianToken}`)
    .send({
      workPerformed: "Replaced front brake pads and inspected rotors.",
      notes: "Road-tested; no abnormal noise.",
      status: "in_progress"
    });
  const completed = await request(app).patch(`/api/services/${serviceId}/execution`)
    .set("Authorization", `Bearer ${context.technicianToken}`)
    .send({ status: "completed" });
  const editCompleted = await request(app).patch(`/api/services/${serviceId}/execution`)
    .set("Authorization", `Bearer ${context.technicianToken}`)
    .send({ notes: "Edit after completion" });
  const events = await request(app).get("/api/admin/audit-events")
    .set("Authorization", `Bearer ${context.adminToken}`);
  const completionEvent = events.body.events.find((event: { action: string }) => event.action === "service.completed");

  assert.equal(missingWork.status, 400);
  assert.equal(progress.body.service.status, "in_progress");
  assert.equal(progress.body.service.workPerformed, "Replaced front brake pads and inspected rotors.");
  assert.equal(progress.body.service.notes, "Road-tested; no abnormal noise.");
  assert.equal(completed.status, 200);
  assert.equal(completed.body.service.status, "completed");
  assert.equal(Number.isNaN(Date.parse(completed.body.service.completedAt)), false);
  assert.equal(editCompleted.status, 409);
  assert.equal(completionEvent.actorUserId, context.technician.id);
  assert.equal(completionEvent.details.completedAt, completed.body.service.completedAt);
});

test("rejects assignment to inactive or non-technician users and prevents editing completed work", async () => {
  const app = createApp(context.db, secret);
  const created = await request(app).post("/api/services")
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ description: "Inspect transmission" });
  const invalidRole = await request(app).post(`/api/services/${created.body.service.id}/assign`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ technicianUserId: context.customer.id });
  const deactivate = await request(app).patch(`/api/admin/users/${context.technician.id}`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ isActive: false });
  const inactiveTechnician = await request(app).post(`/api/services/${created.body.service.id}/assign`)
    .set("Authorization", `Bearer ${context.adminToken}`)
    .send({ technicianUserId: context.technician.id });

  assert.equal(invalidRole.status, 400);
  assert.equal(deactivate.status, 200);
  assert.equal(inactiveTechnician.status, 400);
});

test("migrates existing service tables with execution and assignment fields", () => {
  const legacyDb = new Database(":memory:");
  legacyDb.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE services (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  initializeDatabase(legacyDb);
  const columns = legacyDb.prepare("PRAGMA table_info(services)").all() as Array<{ name: string }>;
  const columnNames = columns.map(({ name }) => name);
  assert.ok(columnNames.includes("assigned_to"));
  assert.ok(columnNames.includes("work_performed"));
  assert.ok(columnNames.includes("service_notes"));
  assert.ok(columnNames.includes("completed_at"));
  legacyDb.close();
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
