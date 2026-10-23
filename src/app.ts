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

const serviceStatuses = [
  "received",
  "assigned",
  "in_progress",
  "awaiting_parts",
  "completed",
  "cancelled"
] as const;

const emailSchema = z.email().max(254);

const passwordSchema = z
  .string()
  .min(12)
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Password must be at most 72 UTF-8 bytes"
  );

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
}).refine(
  (value) => Object.keys(value).length > 0,
  "Provide at least one field to update"
);

const createServiceSchema = z.object({
  description: z.string().trim().min(1).max(500)
});

const updateServiceStatusSchema = z.object({
  status: z.enum(serviceStatuses)
});

// Customer validation schemas

const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  phone: z.string().trim().min(7).max(20),
  address: z.string().trim().max(250).optional()
});

const updateCustomerSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: emailSchema.optional(),
  phone: z.string().trim().min(7).max(20).optional(),
  address: z.string().trim().max(250).nullable().optional()
}).refine(
  (value) => Object.keys(value).length > 0,
  "Provide at least one field to update"
);

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

interface CustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string | null;
  createdAt: string;
  updatedAt: string;
}
interface VehicleRow {
  id: string;
  customerId: string;
  registrationNumber: string;
  make: string;
  model: string;
  year: number;
  createdAt: string;
  updatedAt: string;
}

function parseInput<T>(
  schema: z.ZodType<T>,
  input: unknown,
  res: express.Response
): T | undefined {
  const result = schema.safeParse(input);

  if (!result.success) {
    res.status(400).json({
      error: "Invalid request",
      details: result.error.issues.map(({ path, message }) => ({
        path,
        message
      }))
    });

    return undefined;
  }

  return result.data;
}

function userView(
  row: UserRow
): Omit<UserRow, "isActive"> & { isActive: boolean } {
  const { isActive, ...user } = row;

  return {
    ...user,
    isActive: Boolean(isActive)
  };
}

function pagination(
  req: express.Request,
  res: express.Response
): { limit: number; offset: number } | undefined {
  const schema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(100000).default(0)
  });

  return parseInput(schema, req.query, res);
}

export function createApp(
  db: AppDatabase,
  jwtSecret: string
): express.Express {
  if (jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }

  const app = express();
  const authenticate = authentication(db, jwtSecret);
  const adminOnly = [authenticate, requireRoles("Administrator")];

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "16kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // ============================================================
  // AUTHENTICATION
  // ============================================================

  app.post(
    "/api/auth/login",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: "draft-8",
      legacyHeaders: false
    }),
    async (req, res) => {
      const input = parseInput(
        z.object({
          email: emailSchema,
          password: z.string()
            .min(1)
            .refine(
              (value) => Buffer.byteLength(value, "utf8") <= 72,
              "Password must be at most 72 UTF-8 bytes"
            )
        }),
        req.body,
        res
      );

      if (!input) return;

      const row = db.prepare(`
        SELECT
          id,
          email,
          display_name AS displayName,
          password_hash AS passwordHash,
          role
        FROM users
        WHERE email = ? COLLATE NOCASE AND is_active = 1
      `).get(input.email) as
        | {
            id: string;
            email: string;
            displayName: string;
            passwordHash: string;
            role: Role;
          }
        | undefined;

      const passwordHash =
        row?.passwordHash ??
        await bcrypt.hash("invalid-login-placeholder", 12);

      if (!(await verifyPassword(input.password, passwordHash)) || !row) {
        res.status(401).json({
          error: "Invalid email or password"
        });

        return;
      }

      const user: AuthenticatedUser = {
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        role: row.role
      };

      recordAuditEvent(db, {
        actor: user,
        action: "auth.login_succeeded",
        targetType: "user",
        targetId: user.id,
        details: {}
      });

      res.json({
        accessToken: createToken(user, jwtSecret),
        tokenType: "Bearer",
        expiresIn: 3600,
        user
      });
    }
  );

  // ============================================================
  // USER ADMINISTRATION
  // ============================================================

  app.get("/api/admin/users", ...adminOnly, (req, res) => {
    const page = pagination(req, res);

    if (!page) return;

    const users = db.prepare(`
      SELECT
        id,
        email,
        display_name AS displayName,
        role,
        is_active AS isActive,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM users
      ORDER BY created_at DESC, id
      LIMIT ? OFFSET ?
    `).all(page.limit, page.offset) as UserRow[];

    const total = (
      db.prepare("SELECT COUNT(*) AS count FROM users").get() as {
        count: number;
      }
    ).count;

    res.json({
      users: users.map(userView),
      total,
      limit: page.limit,
      offset: page.offset
    });
  });

  app.post("/api/admin/users", ...adminOnly, async (req, res) => {
    const input = parseInput(createUserSchema, req.body, res);

    if (!input) return;

    const now = new Date().toISOString();
    const id = randomUUID();
    const email = input.email.trim().toLowerCase();
    const passwordHash = await hashPassword(input.password);

    try {
      db.transaction(() => {
        db.prepare(`
          INSERT INTO users (
            id,
            email,
            display_name,
            password_hash,
            role,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          email,
          input.displayName,
          passwordHash,
          input.role,
          now,
          now
        );

        recordAuditEvent(db, {
          actor: req.user!,
          action: "user.created",
          targetType: "user",
          targetId: id,
          details: {
            email,
            displayName: input.displayName,
            role: input.role
          }
        });
      })();
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("UNIQUE constraint failed: users.email")
      ) {
        res.status(409).json({
          error: "A user with this email already exists"
        });

        return;
      }

      throw error;
    }

    const created = db.prepare(`
      SELECT
        id,
        email,
        display_name AS displayName,
        role,
        is_active AS isActive,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM users
      WHERE id = ?
    `).get(id) as UserRow;

    res.status(201).json({
      user: userView(created)
    });
  });

  app.patch("/api/admin/users/:id", ...adminOnly, async (req, res) => {
    const input = parseInput(updateUserSchema, req.body, res);

    if (!input) return;

    const existing = db.prepare(`
      SELECT
        id,
        email,
        display_name AS displayName,
        password_hash AS passwordHash,
        role,
        is_active AS isActive,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM users
      WHERE id = ?
    `).get(req.params.id) as
      | (UserRow & { passwordHash: string })
      | undefined;

    if (!existing) {
      res.status(404).json({
        error: "User not found"
      });

      return;
    }

    const updatedRole = input.role ?? existing.role;
    const updatedActive = input.isActive ?? Boolean(existing.isActive);

    if (
      existing.id === req.user!.id &&
      (updatedRole !== existing.role || !updatedActive)
    ) {
      res.status(400).json({
        error: "You cannot change your own role or deactivate your account"
      });

      return;
    }

    const next = {
      email: input.email?.trim().toLowerCase() ?? existing.email,
      displayName: input.displayName ?? existing.displayName,
      passwordHash: input.password
        ? await hashPassword(input.password)
        : existing.passwordHash,
      role: updatedRole,
      isActive: Number(updatedActive),
      updatedAt: new Date().toISOString()
    };

    const changes: Record<string, unknown> = {};

    if (next.email !== existing.email) {
      changes.email = {
        from: existing.email,
        to: next.email
      };
    }

    if (next.displayName !== existing.displayName) {
      changes.displayName = {
        from: existing.displayName,
        to: next.displayName
      };
    }

    if (input.password) {
      changes.passwordChanged = true;
    }

    if (next.role !== existing.role) {
      changes.role = {
        from: existing.role,
        to: next.role
      };
    }

    if (next.isActive !== existing.isActive) {
      changes.isActive = {
        from: Boolean(existing.isActive),
        to: Boolean(next.isActive)
      };
    }

    try {
      db.transaction(() => {
        const removesActiveAdmin =
          existing.role === "Administrator" &&
          existing.isActive === 1 &&
          (next.role !== "Administrator" || next.isActive === 0);

        if (removesActiveAdmin) {
          const activeAdmins = (
            db.prepare(`
              SELECT COUNT(*) AS count
              FROM users
              WHERE role = 'Administrator' AND is_active = 1
            `).get() as { count: number }
          ).count;

          if (activeAdmins <= 1) {
            throw new Error("LAST_ACTIVE_ADMIN");
          }
        }

        db.prepare(`
          UPDATE users
          SET
            email = ?,
            display_name = ?,
            password_hash = ?,
            role = ?,
            is_active = ?,
            updated_at = ?
          WHERE id = ?
        `).run(
          next.email,
          next.displayName,
          next.passwordHash,
          next.role,
          next.isActive,
          next.updatedAt,
          existing.id
        );

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
      if (
        error instanceof Error &&
        error.message === "LAST_ACTIVE_ADMIN"
      ) {
        res.status(409).json({
          error: "The last active administrator cannot be demoted or deactivated"
        });

        return;
      }

      if (
        error instanceof Error &&
        error.message.includes("UNIQUE constraint failed: users.email")
      ) {
        res.status(409).json({
          error: "A user with this email already exists"
        });

        return;
      }

      throw error;
    }

    const updated = db.prepare(`
      SELECT
        id,
        email,
        display_name AS displayName,
        role,
        is_active AS isActive,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM users
      WHERE id = ?
    `).get(existing.id) as UserRow;

    res.json({
      user: userView(updated)
    });
  });

  // ============================================================
  // AUDIT LOGGING
  // ============================================================

  app.get("/api/admin/audit-events", ...adminOnly, (req, res) => {
    const page = pagination(req, res);

    if (!page) return;

    const events = db.prepare(`
      SELECT
        id,
        actor_user_id AS actorUserId,
        actor_email AS actorEmail,
        actor_role AS actorRole,
        action,
        target_type AS targetType,
        target_id AS targetId,
        details_json AS detailsJson,
        created_at AS createdAt
      FROM audit_events
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(page.limit, page.offset) as AuditRow[];

    const total = (
      db.prepare("SELECT COUNT(*) AS count FROM audit_events").get() as {
        count: number;
      }
    ).count;

    res.json({
      events: events.map(({ detailsJson, ...event }) => ({
        ...event,
        details: JSON.parse(detailsJson) as Record<string, unknown>
      })),
      total,
      limit: page.limit,
      offset: page.offset
    });
  });

  // ============================================================
  // CUSTOMER REGISTRATION AND MANAGEMENT - ISSUE #9
  // ============================================================

  // Register a customer.
  app.post(
    "/api/customers",
    authenticate,
    requireRoles("Administrator", "Service Advisor"),
    (req, res) => {
      const input = parseInput(createCustomerSchema, req.body, res);

      if (!input) return;

      const id = randomUUID();
      const now = new Date().toISOString();
      const email = input.email.trim().toLowerCase();
      const phone = input.phone.trim();
      const address = input.address?.trim() || null;

      try {
        db.transaction(() => {
          db.prepare(`
            INSERT INTO customers (
              id,
              name,
              email,
              phone,
              address,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            id,
            input.name,
            email,
            phone,
            address,
            now,
            now
          );

          recordAuditEvent(db, {
            actor: req.user!,
            action: "customer.created",
            targetType: "customer",
            targetId: id,
            details: {
              name: input.name,
              email
            }
          });
        })();
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("UNIQUE constraint failed: customers.email")
        ) {
          res.status(409).json({
            error: "A customer with this email already exists"
          });

          return;
        }

        throw error;
      }

      res.status(201).json({
        customer: {
          id,
          name: input.name,
          email,
          phone,
          address,
          createdAt: now,
          updatedAt: now
        }
      });
    }
  );

  // List customers with pagination.
  app.get(
    "/api/customers",
    authenticate,
    requireRoles("Administrator", "Service Advisor"),
    (req, res) => {
      const page = pagination(req, res);

      if (!page) return;

      const customers = db.prepare(`
        SELECT
          id,
          name,
          email,
          phone,
          address,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM customers
        ORDER BY created_at DESC, id
        LIMIT ? OFFSET ?
      `).all(page.limit, page.offset) as CustomerRow[];

      const total = (
        db.prepare("SELECT COUNT(*) AS count FROM customers").get() as {
          count: number;
        }
      ).count;

      res.json({
        customers,
        total,
        limit: page.limit,
        offset: page.offset
      });
    }
  );

  // View an individual customer.
  app.get(
    "/api/customers/:id",
    authenticate,
    requireRoles("Administrator", "Service Advisor"),
    (req, res) => {
      const customer = db.prepare(`
        SELECT
          id,
          name,
          email,
          phone,
          address,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM customers
        WHERE id = ?
      `).get(req.params.id) as CustomerRow | undefined;

      if (!customer) {
        res.status(404).json({
          error: "Customer not found"
        });

        return;
      }

      res.json({
        customer
      });
    }
  );

  // Update an individual customer's information.
  app.patch(
    "/api/customers/:id",
    authenticate,
    requireRoles("Administrator", "Service Advisor"),
    (req, res) => {
      const input = parseInput(updateCustomerSchema, req.body, res);

      if (!input) return;

      const existing = db.prepare(`
        SELECT
          id,
          name,
          email,
          phone,
          address,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM customers
        WHERE id = ?
      `).get(req.params.id) as CustomerRow | undefined;

      if (!existing) {
        res.status(404).json({
          error: "Customer not found"
        });

        return;
      }

      const next = {
        name: input.name ?? existing.name,
        email: input.email?.trim().toLowerCase() ?? existing.email,
        phone: input.phone?.trim() ?? existing.phone,
        address: input.address === undefined
          ? existing.address
          : input.address?.trim() || null,
        updatedAt: new Date().toISOString()
      };

      const changes: Record<string, unknown> = {};

      if (next.name !== existing.name) {
        changes.name = {
          from: existing.name,
          to: next.name
        };
      }

      if (next.email !== existing.email) {
        changes.email = {
          from: existing.email,
          to: next.email
        };
      }

      if (next.phone !== existing.phone) {
        changes.phone = {
          from: existing.phone,
          to: next.phone
        };
      }

      if (next.address !== existing.address) {
        changes.address = {
          from: existing.address,
          to: next.address
        };
      }

      try {
        db.transaction(() => {
          db.prepare(`
            UPDATE customers
            SET
              name = ?,
              email = ?,
              phone = ?,
              address = ?,
              updated_at = ?
            WHERE id = ?
          `).run(
            next.name,
            next.email,
            next.phone,
            next.address,
            next.updatedAt,
            existing.id
          );

          if (Object.keys(changes).length > 0) {
            recordAuditEvent(db, {
              actor: req.user!,
              action: "customer.updated",
              targetType: "customer",
              targetId: existing.id,
              details: changes
            });
          }
        })();
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("UNIQUE constraint failed: customers.email")
        ) {
          res.status(409).json({
            error: "A customer with this email already exists"
          });

          return;
        }

        throw error;
      }

      res.json({
        customer: {
          ...existing,
          ...next
        }
      });
    }
  );
    // ============================================================
  // VEHICLE REGISTRATION AND MANAGEMENT - ISSUE #10
  // ============================================================

  // Register a vehicle for an existing customer.
  app.post(
    "/api/vehicles",
    authenticate,
    requireRoles("Administrator", "Service Advisor"),
    (req, res) => {
      const input = parseInput(createVehicleSchema, req.body, res);

      if (!input) return;

      const customer = db.prepare(`
        SELECT id
        FROM customers
        WHERE id = ?
      `).get(input.customerId) as { id: string } | undefined;

      if (!customer) {
        res.status(404).json({
          error: "Customer not found"
        });
        return;
      }

      const id = randomUUID();
      const now = new Date().toISOString();
      const registrationNumber = input.registrationNumber
        .trim()
        .toUpperCase();

      try {
        db.transaction(() => {
          db.prepare(`
            INSERT INTO vehicles (
              id,
              customer_id,
              registration_number,
              make,
              model,
              year,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id,
            input.customerId,
            registrationNumber,
            input.make.trim(),
            input.model.trim(),
            input.year,
            now,
            now
          );

          recordAuditEvent(db, {
            actor: req.user!,
            action: "vehicle.created",
            targetType: "vehicle",
            targetId: id,
            details: {
              customerId: input.customerId,
              registrationNumber,
              make: input.make.trim(),
              model: input.model.trim(),
              year: input.year
            }
          });
        })();
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes(
            "UNIQUE constraint failed: vehicles.registration_number"
          )
        ) {
          res.status(409).json({
            error: "A vehicle with this registration number already exists"
          });
          return;
        }

        throw error;
      }

      res.status(201).json({
        vehicle: {
          id,
          customerId: input.customerId,
          registrationNumber,
          make: input.make.trim(),
          model: input.model.trim(),
          year: input.year,
          createdAt: now,
          updatedAt: now
        }
      });
    }
  );

  // List vehicles belonging to a customer.
  app.get(
    "/api/customers/:id/vehicles",
    authenticate,
    requireRoles("Administrator", "Service Advisor"),
    (req, res) => {
      const customer = db.prepare(`
        SELECT id
        FROM customers
        WHERE id = ?
      `).get(req.params.id) as { id: string } | undefined;

      if (!customer) {
        res.status(404).json({
          error: "Customer not found"
        });
        return;
      }

      const vehicles = db.prepare(`
        SELECT
          id,
          customer_id AS customerId,
          registration_number AS registrationNumber,
          make,
          model,
          year,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM vehicles
        WHERE customer_id = ?
        ORDER BY created_at DESC, id
      `).all(req.params.id) as VehicleRow[];

      res.json({
        customerId: req.params.id,
        vehicles,
        total: vehicles.length
      });
    }
  );

  // View a specific vehicle.
  app.get(
    "/api/vehicles/:id",
    authenticate,
    requireRoles("Administrator", "Service Advisor"),
    (req, res) => {
      const vehicle = db.prepare(`
        SELECT
          id,
          customer_id AS customerId,
          registration_number AS registrationNumber,
          make,
          model,
          year,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM vehicles
        WHERE id = ?
      `).get(req.params.id) as VehicleRow | undefined;

      if (!vehicle) {
        res.status(404).json({
          error: "Vehicle not found"
        });
        return;
      }

      res.json({ vehicle });
    }
  );

  // Update vehicle details.
  app.patch(
    "/api/vehicles/:id",
    authenticate,
    requireRoles("Administrator", "Service Advisor"),
    (req, res) => {
      const input = parseInput(updateVehicleSchema, req.body, res);

      if (!input) return;

      const existing = db.prepare(`
        SELECT
          id,
          customer_id AS customerId,
          registration_number AS registrationNumber,
          make,
          model,
          year,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM vehicles
        WHERE id = ?
      `).get(req.params.id) as VehicleRow | undefined;

      if (!existing) {
        res.status(404).json({
          error: "Vehicle not found"
        });
        return;
      }

      const next = {
        registrationNumber:
          input.registrationNumber?.trim().toUpperCase() ??
          existing.registrationNumber,
        make: input.make?.trim() ?? existing.make,
        model: input.model?.trim() ?? existing.model,
        year: input.year ?? existing.year,
        updatedAt: new Date().toISOString()
      };

      const changes: Record<string, unknown> = {};

      if (next.registrationNumber !== existing.registrationNumber) {
        changes.registrationNumber = {
          from: existing.registrationNumber,
          to: next.registrationNumber
        };
      }

      if (next.make !== existing.make) {
        changes.make = {
          from: existing.make,
          to: next.make
        };
      }

      if (next.model !== existing.model) {
        changes.model = {
          from: existing.model,
          to: next.model
        };
      }

      if (next.year !== existing.year) {
        changes.year = {
          from: existing.year,
          to: next.year
        };
      }

      try {
        db.transaction(() => {
          db.prepare(`
            UPDATE vehicles
            SET
              registration_number = ?,
              make = ?,
              model = ?,
              year = ?,
              updated_at = ?
            WHERE id = ?
          `).run(
            next.registrationNumber,
            next.make,
            next.model,
            next.year,
            next.updatedAt,
            existing.id
          );

          if (Object.keys(changes).length > 0) {
            recordAuditEvent(db, {
              actor: req.user!,
              action: "vehicle.updated",
              targetType: "vehicle",
              targetId: existing.id,
              details: changes
            });
          }
        })();
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes(
            "UNIQUE constraint failed: vehicles.registration_number"
          )
        ) {
          res.status(409).json({
            error: "A vehicle with this registration number already exists"
          });
          return;
        }

        throw error;
      }

      res.json({
        vehicle: {
          ...existing,
          ...next
        }
      });
    }
  );

  // ============================================================
  // SERVICE MANAGEMENT
  // ============================================================

  app.post(
    "/api/services",
    authenticate,
    requireRoles("Administrator", "Service Advisor"),
    (req, res) => {
      const input = parseInput(createServiceSchema, req.body, res);

      if (!input) return;

      const id = randomUUID();
      const now = new Date().toISOString();

      db.transaction(() => {
        db.prepare(`
          INSERT INTO services (
            id,
            description,
            status,
            created_by,
            created_at,
            updated_at
          )
          VALUES (?, ?, 'received', ?, ?, ?)
        `).run(
          id,
          input.description,
          req.user!.id,
          now,
          now
        );

        recordAuditEvent(db, {
          actor: req.user!,
          action: "service.created",
          targetType: "service",
          targetId: id,
          details: {
            status: "received"
          }
        });
      })();

      res.status(201).json({
        service: {
          id,
          description: input.description,
          status: "received",
          createdAt: now,
          updatedAt: now
        }
      });
    }
  );

  app.patch(
    "/api/services/:id/status",
    authenticate,
    requireRoles(
      "Administrator",
      "Service Advisor",
      "Service Technician"
    ),
    (req, res) => {
      const input = parseInput(updateServiceStatusSchema, req.body, res);

      if (!input) return;

      const service = db.prepare(`
        SELECT
          id,
          description,
          status,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM services
        WHERE id = ?
      `).get(req.params.id) as
        | {
            id: string;
            description: string;
            status: typeof serviceStatuses[number];
            createdAt: string;
            updatedAt: string;
          }
        | undefined;

      if (!service) {
        res.status(404).json({
          error: "Service not found"
        });

        return;
      }

      const now = new Date().toISOString();

      db.transaction(() => {
        db.prepare(`
          UPDATE services
          SET status = ?, updated_at = ?
          WHERE id = ?
        `).run(
          input.status,
          now,
          service.id
        );

        recordAuditEvent(db, {
          actor: req.user!,
          action: "service.status_changed",
          targetType: "service",
          targetId: service.id,
          details: {
            from: service.status,
            to: input.status
          }
        });
      })();

      res.json({
        service: {
          ...service,
          status: input.status,
          updatedAt: now
        }
      });
    }
  );

  // ============================================================
  // ERROR HANDLING
  // ============================================================

  const notFound: RequestHandler = (_req, res) => {
    res.status(404).json({
      error: "Not found"
    });
  };

  app.use(notFound);

  app.use((
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({
        error: "Malformed JSON request body"
      });

      return;
    }

    console.error("Unhandled request error", error);

    res.status(500).json({
      error: "Internal server error"
    });
  });

  return app;
}
// ============================================================
// VEHICLE VALIDATION SCHEMAS - ISSUE #10
// ============================================================

const currentYear = new Date().getFullYear();

const createVehicleSchema = z.object({
  customerId: z.string().trim().min(1, "Customer ID is required"),

  registrationNumber: z
    .string()
    .trim()
    .min(1, "Registration number is required")
    .max(20)
    .regex(
      /^[A-Za-z0-9 -]+$/,
      "Registration number contains invalid characters"
    ),

  make: z.string().trim().min(1, "Vehicle make is required").max(60),

  model: z.string().trim().min(1, "Vehicle model is required").max(60),

  year: z.coerce
    .number()
    .int("Year must be a whole number")
    .min(1886, "Vehicle year is invalid")
    .max(currentYear + 1, "Vehicle year cannot be in the future")
});

const updateVehicleSchema = z
  .object({
    registrationNumber: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .regex(/^[A-Za-z0-9 -]+$/)
      .optional(),

    make: z.string().trim().min(1).max(60).optional(),

    model: z.string().trim().min(1).max(60).optional(),

    year: z.coerce
      .number()
      .int()
      .min(1886)
      .max(currentYear + 1)
      .optional()
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one field to update"
  );