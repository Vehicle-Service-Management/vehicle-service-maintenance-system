import bcrypt from "bcryptjs";
import express, { type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { recordAuditEvent } from "./audit";
import { authentication, createToken, hashPassword, requireRoles, verifyPassword } from "./auth";
import type { AppDatabase } from "./db";
import { roles, type AuthenticatedUser, type Role } from "./types";

const serviceStatuses = ["received", "assigned", "in_progress", "awaiting_parts", "completed", "cancelled"] as const;
const emailSchema = z.email().max(254);
const passwordSchema = z.string().min(12).refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password must be at most 72 UTF-8 bytes");
const createUserSchema = z.object({
  email: emailSchema,
  displayName: z.string().trim().min(1).max(100),
  password: passwordSchema,
  role: z.enum(roles)
});
const updateUserSchema = z.object({
  email: emailSchema.optional(),
  displayName: z.string().trim().min(1).max(100).optional(),
  password: passwordSchema.optional(),
  role: z.enum(roles).optional(),
  isActive: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");
const createServiceSchema = z.object({
  description: z.string().trim().min(1).max(500)
});
const updateServiceStatusSchema = z.object({
  status: z.enum(serviceStatuses)
});
const assignServiceSchema = z.object({
  technicianUserId: z.uuid()
});
const updateExecutionSchema = z.object({
  workPerformed: z.string().trim().min(1).max(10000).optional(),
  notes: z.string().trim().max(5000).optional(),
  status: z.enum(serviceStatuses).optional()
}).refine((value) => Object.keys(value).length > 0, "Provide at least one execution field to update");

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

interface AuditRow {
  id: string;
  actorUserId: string | null;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  detailsJson: string;
  createdAt: string;
}

interface ServiceRow {
  id: string;
  description: string;
  status: typeof serviceStatuses[number];
  createdBy: string;
  assignedTo: string | null;
  assignedTechnicianName: string | null;
  assignedTechnicianEmail: string | null;
  workPerformed: string;
  notes: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function serviceSelect(): string {
  return `
    SELECT s.id, s.description, s.status, s.created_by AS createdBy,
           s.assigned_to AS assignedTo, u.display_name AS assignedTechnicianName,
           u.email AS assignedTechnicianEmail, s.work_performed AS workPerformed,
           s.service_notes AS notes, s.completed_at AS completedAt,
           s.created_at AS createdAt, s.updated_at AS updatedAt
    FROM services s LEFT JOIN users u ON u.id = s.assigned_to
  `;
}

function canModifyService(user: AuthenticatedUser, service: ServiceRow): boolean {
  return user.role !== "Service Technician" || service.assignedTo === user.id;
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown, res: express.Response): T | undefined {
  const result = schema.safeParse(input);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", details: result.error.issues.map(({ path, message }) => ({ path, message })) });
    return undefined;
  }
  return result.data;
}

function userView(row: UserRow): Omit<UserRow, "isActive"> & { isActive: boolean } {
  const { isActive, ...user } = row;
  return { ...user, isActive: Boolean(isActive) };
}

function pagination(req: express.Request, res: express.Response): { limit: number; offset: number } | undefined {
  const schema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(100000).default(0)
  });
  return parseInput(schema, req.query, res);
}

export function createApp(db: AppDatabase, jwtSecret: string): express.Express {
  if (jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }

  const app = express();
  const authenticate = authentication(db, jwtSecret);
  const adminOnly = [authenticate, requireRoles("Administrator")];

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "16kb" }));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.post("/api/auth/login", rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false
  }), async (req, res) => {
    const input = parseInput(z.object({
      email: emailSchema,
      password: z.string().min(1).refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password must be at most 72 UTF-8 bytes")
    }), req.body, res);
    if (!input) return;
    const row = db.prepare(`
      SELECT id, email, display_name AS displayName, password_hash AS passwordHash, role
      FROM users WHERE email = ? COLLATE NOCASE AND is_active = 1
    `).get(input.email) as
      | { id: string; email: string; displayName: string; passwordHash: string; role: Role }
      | undefined;

    const passwordHash = row?.passwordHash ?? await bcrypt.hash("invalid-login-placeholder", 12);
    if (!(await verifyPassword(input.password, passwordHash)) || !row) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const user: AuthenticatedUser = { id: row.id, email: row.email, displayName: row.displayName, role: row.role };
    recordAuditEvent(db, {
      actor: user,
      action: "auth.login_succeeded",
      targetType: "user",
      targetId: user.id,
      details: {}
    });
    res.json({ accessToken: createToken(user, jwtSecret), tokenType: "Bearer", expiresIn: 3600, user });
  });

  app.get("/api/admin/users", ...adminOnly, (req, res) => {
    const page = pagination(req, res);
    if (!page) return;
    const users = db.prepare(`
      SELECT id, email, display_name AS displayName, role, is_active AS isActive,
             created_at AS createdAt, updated_at AS updatedAt
      FROM users ORDER BY created_at DESC, id LIMIT ? OFFSET ?
    `).all(page.limit, page.offset) as UserRow[];
    const total = (db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number }).count;
    res.json({ users: users.map(userView), total, limit: page.limit, offset: page.offset });
  });

  app.post("/api/admin/users", ...adminOnly, async (req, res) => {
    const input = parseInput(createUserSchema, req.body, res);
    if (!input) return;
    const now = new Date().toISOString();
    const id = randomUUID();
    const passwordHash = await hashPassword(input.password);
    try {
      db.transaction(() => {
        db.prepare(`
          INSERT INTO users (id, email, display_name, password_hash, role, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, input.email.trim().toLowerCase(), input.displayName, passwordHash, input.role, now, now);
        recordAuditEvent(db, {
          actor: req.user!,
          action: "user.created",
          targetType: "user",
          targetId: id,
          details: { email: input.email.trim().toLowerCase(), displayName: input.displayName, role: input.role }
        });
      })();
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed: users.email")) {
        res.status(409).json({ error: "A user with this email already exists" });
        return;
      }
      throw error;
    }
    const created = db.prepare(`
      SELECT id, email, display_name AS displayName, role, is_active AS isActive,
             created_at AS createdAt, updated_at AS updatedAt
      FROM users WHERE id = ?
    `).get(id) as UserRow;
    res.status(201).json({ user: userView(created) });
  });

  app.patch("/api/admin/users/:id", ...adminOnly, async (req, res) => {
    const input = parseInput(updateUserSchema, req.body, res);
    if (!input) return;
    const existing = db.prepare(`
      SELECT id, email, display_name AS displayName, password_hash AS passwordHash,
             role, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
      FROM users WHERE id = ?
    `).get(req.params.id) as (UserRow & { passwordHash: string }) | undefined;
    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const updatedRole = input.role ?? existing.role;
    const updatedActive = input.isActive ?? Boolean(existing.isActive);
    if (existing.id === req.user!.id && (updatedRole !== existing.role || !updatedActive)) {
      res.status(400).json({ error: "You cannot change your own role or deactivate your account" });
      return;
    }

    const next = {
      email: input.email?.trim().toLowerCase() ?? existing.email,
      displayName: input.displayName ?? existing.displayName,
      passwordHash: input.password ? await hashPassword(input.password) : existing.passwordHash,
      role: updatedRole,
      isActive: Number(updatedActive),
      updatedAt: new Date().toISOString()
    };
    const changes: Record<string, unknown> = {};
    if (next.email !== existing.email) changes.email = { from: existing.email, to: next.email };
    if (next.displayName !== existing.displayName) changes.displayName = { from: existing.displayName, to: next.displayName };
    if (input.password) changes.passwordChanged = true;
    if (next.role !== existing.role) changes.role = { from: existing.role, to: next.role };
    if (next.isActive !== existing.isActive) changes.isActive = { from: Boolean(existing.isActive), to: Boolean(next.isActive) };

    try {
      db.transaction(() => {
        const removesActiveAdmin = existing.role === "Administrator" && existing.isActive === 1 &&
          (next.role !== "Administrator" || next.isActive === 0);
        if (removesActiveAdmin) {
          const activeAdmins = (db.prepare(`
            SELECT COUNT(*) AS count FROM users
            WHERE role = 'Administrator' AND is_active = 1
          `).get() as { count: number }).count;
          if (activeAdmins <= 1) throw new Error("LAST_ACTIVE_ADMIN");
        }
        db.prepare(`
          UPDATE users SET email = ?, display_name = ?, password_hash = ?, role = ?, is_active = ?, updated_at = ?
          WHERE id = ?
        `).run(next.email, next.displayName, next.passwordHash, next.role, next.isActive, next.updatedAt, existing.id);
        if (Object.keys(changes).length > 0) {
          recordAuditEvent(db, {
            actor: req.user!,
            action: "user.updated",
            targetType: "user",
            targetId: existing.id,
            details: changes
          });
        }
      })();
    } catch (error) {
      if (error instanceof Error && error.message === "LAST_ACTIVE_ADMIN") {
        res.status(409).json({ error: "The last active administrator cannot be demoted or deactivated" });
        return;
      }
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed: users.email")) {
        res.status(409).json({ error: "A user with this email already exists" });
        return;
      }
      throw error;
    }
    const updated = db.prepare(`
      SELECT id, email, display_name AS displayName, role, is_active AS isActive,
             created_at AS createdAt, updated_at AS updatedAt
      FROM users WHERE id = ?
    `).get(existing.id) as UserRow;
    res.json({ user: userView(updated) });
  });

  app.get("/api/admin/audit-events", ...adminOnly, (req, res) => {
    const page = pagination(req, res);
    if (!page) return;
    const events = db.prepare(`
      SELECT id, actor_user_id AS actorUserId, actor_email AS actorEmail, actor_role AS actorRole,
             action, target_type AS targetType, target_id AS targetId, details_json AS detailsJson,
             created_at AS createdAt
      FROM audit_events ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
    `).all(page.limit, page.offset) as AuditRow[];
    const total = (db.prepare("SELECT COUNT(*) AS count FROM audit_events").get() as { count: number }).count;
    res.json({
      events: events.map(({ detailsJson, ...event }) => ({ ...event, details: JSON.parse(detailsJson) as Record<string, unknown> })),
      total,
      limit: page.limit,
      offset: page.offset
    });
  });

  app.post("/api/services", authenticate, requireRoles("Administrator", "Service Advisor"), (req, res) => {
    const input = parseInput(createServiceSchema, req.body, res);
    if (!input) return;
    const id = randomUUID();
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare(`
        INSERT INTO services (id, description, status, created_by, created_at, updated_at)
        VALUES (?, ?, 'received', ?, ?, ?)
      `).run(id, input.description, req.user!.id, now, now);
      recordAuditEvent(db, {
        actor: req.user!,
        action: "service.created",
        targetType: "service",
        targetId: id,
        details: { status: "received" }
      });
    })();
    res.status(201).json({ service: { id, description: input.description, status: "received", createdAt: now, updatedAt: now } });
  });

  app.get("/api/services/assigned", authenticate, requireRoles("Administrator", "Service Advisor", "Service Technician"), (req, res) => {
    const page = pagination(req, res);
    if (!page) return;
    const assignedFilter = req.user!.role === "Service Technician" ? "AND s.assigned_to = ?" : "AND s.assigned_to IS NOT NULL";
    const values = req.user!.role === "Service Technician"
      ? [req.user!.id, page.limit, page.offset]
      : [page.limit, page.offset];
    const services = db.prepare(`
      ${serviceSelect()}
      WHERE s.status NOT IN ('completed', 'cancelled') ${assignedFilter}
      ORDER BY s.updated_at DESC, s.id LIMIT ? OFFSET ?
    `).all(...values) as ServiceRow[];
    const countValues = req.user!.role === "Service Technician" ? [req.user!.id] : [];
    const total = (db.prepare(`
      SELECT COUNT(*) AS count FROM services s
      WHERE s.status NOT IN ('completed', 'cancelled') ${assignedFilter}
    `).get(...countValues) as { count: number }).count;
    res.json({ services, total, limit: page.limit, offset: page.offset });
  });

  app.post("/api/services/:id/assign", authenticate, requireRoles("Administrator", "Service Advisor"), (req, res) => {
    const input = parseInput(assignServiceSchema, req.body, res);
    if (!input) return;
    const service = db.prepare(`${serviceSelect()} WHERE s.id = ?`).get(req.params.id) as ServiceRow | undefined;
    if (!service) {
      res.status(404).json({ error: "Service not found" });
      return;
    }
    if (service.status === "completed" || service.status === "cancelled") {
      res.status(409).json({ error: "A completed or cancelled service cannot be assigned" });
      return;
    }
    const technician = db.prepare(`
      SELECT id, display_name AS displayName, email FROM users
      WHERE id = ? AND role = 'Service Technician' AND is_active = 1
    `).get(input.technicianUserId) as { id: string; displayName: string; email: string } | undefined;
    if (!technician) {
      res.status(400).json({ error: "Assigned user must be an active Service Technician" });
      return;
    }

    const now = new Date().toISOString();
    const status = service.status === "received" ? "assigned" : service.status;
    db.transaction(() => {
      db.prepare("UPDATE services SET assigned_to = ?, status = ?, updated_at = ? WHERE id = ?")
        .run(technician.id, status, now, service.id);
      recordAuditEvent(db, {
        actor: req.user!,
        action: "service.assigned",
        targetType: "service",
        targetId: service.id,
        details: {
          assignedTo: { from: service.assignedTo, to: technician.id },
          status: { from: service.status, to: status }
        }
      });
    })();
    const updated = db.prepare(`${serviceSelect()} WHERE s.id = ?`).get(service.id) as ServiceRow;
    res.json({ service: updated });
  });

  app.patch("/api/services/:id/execution", authenticate, requireRoles("Administrator", "Service Advisor", "Service Technician"), (req, res) => {
    const input = parseInput(updateExecutionSchema, req.body, res);
    if (!input) return;
    const service = db.prepare(`${serviceSelect()} WHERE s.id = ?`).get(req.params.id) as ServiceRow | undefined;
    if (!service) {
      res.status(404).json({ error: "Service not found" });
      return;
    }
    if (!canModifyService(req.user!, service)) {
      res.status(403).json({ error: "Technicians may only update services assigned to them" });
      return;
    }
    if (service.status === "completed" || service.status === "cancelled") {
      res.status(409).json({ error: "A completed or cancelled service cannot be modified" });
      return;
    }
    const status = input.status ?? service.status;
    if (status === "completed" && (!service.assignedTo || !(input.workPerformed ?? service.workPerformed).trim())) {
      res.status(400).json({ error: "Assign the service and record work performed before completing it" });
      return;
    }
    if (req.user!.role === "Service Technician" && status === "cancelled") {
      res.status(403).json({ error: "Technicians cannot cancel service requests" });
      return;
    }
    const workPerformed = input.workPerformed ?? service.workPerformed;
    const notes = input.notes ?? service.notes;
    const now = new Date().toISOString();
    const completedAt = status === "completed" ? now : null;
    const changes: Record<string, unknown> = {};
    if (workPerformed !== service.workPerformed) changes.workPerformed = { from: service.workPerformed, to: workPerformed };
    if (notes !== service.notes) changes.notes = { from: service.notes, to: notes };
    if (status !== service.status) changes.status = { from: service.status, to: status };
    if (Object.keys(changes).length === 0) {
      res.json({ service });
      return;
    }
    db.transaction(() => {
      db.prepare(`
        UPDATE services
        SET work_performed = ?, service_notes = ?, status = ?, completed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(workPerformed, notes, status, completedAt, now, service.id);
      recordAuditEvent(db, {
        actor: req.user!,
        action: status === "completed" ? "service.completed" : "service.execution_updated",
        targetType: "service",
        targetId: service.id,
        details: { ...changes, completedAt }
      });
    })();
    const updated = db.prepare(`${serviceSelect()} WHERE s.id = ?`).get(service.id) as ServiceRow;
    res.json({ service: updated });
  });

  app.patch("/api/services/:id/status", authenticate, requireRoles("Administrator", "Service Advisor", "Service Technician"), (req, res) => {
    const input = parseInput(updateServiceStatusSchema, req.body, res);
    if (!input) return;
    const service = db.prepare(`${serviceSelect()} WHERE s.id = ?`).get(req.params.id) as ServiceRow | undefined;
    if (!service) {
      res.status(404).json({ error: "Service not found" });
      return;
    }
    if (!canModifyService(req.user!, service)) {
      res.status(403).json({ error: "Technicians may only update services assigned to them" });
      return;
    }
    if (service.status === "completed" || service.status === "cancelled") {
      res.status(409).json({ error: "A completed or cancelled service cannot be modified" });
      return;
    }
    if (req.user!.role === "Service Technician" && input.status === "cancelled") {
      res.status(403).json({ error: "Technicians cannot cancel service requests" });
      return;
    }
    if (input.status === "completed" && (!service.assignedTo || !service.workPerformed.trim())) {
      res.status(400).json({ error: "Assign the service and record work performed before completing it" });
      return;
    }
    const now = new Date().toISOString();
    db.transaction(() => {
      const completedAt = input.status === "completed" ? now : null;
      db.prepare("UPDATE services SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?")
        .run(input.status, completedAt, now, service.id);
      recordAuditEvent(db, {
        actor: req.user!,
        action: input.status === "completed" ? "service.completed" : "service.status_changed",
        targetType: "service",
        targetId: service.id,
        details: { from: service.status, to: input.status, completedAt }
      });
    })();
    const updated = db.prepare(`${serviceSelect()} WHERE s.id = ?`).get(service.id) as ServiceRow;
    res.json({ service: updated });
  });

  const notFound: RequestHandler = (_req, res) => res.status(404).json({ error: "Not found" });
  app.use(notFound);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({ error: "Malformed JSON request body" });
      return;
    }
    console.error("Unhandled request error", error);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
