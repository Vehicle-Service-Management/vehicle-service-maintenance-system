import express from "express";
import { randomUUID } from "node:crypto";
import { recordAuditEvent } from "../audit";
import { hashPassword } from "../auth";
import type { RouteContext } from "./context";
import { createUserSchema, updateUserSchema, UserRow, AuditRow, parseInput, userView, pagination } from "./shared";

export function createAdminRouter(context: RouteContext) {
  const router = express.Router();
  const { db, adminOnly } = context;

  router.get("/admin/users", ...adminOnly, (req, res) => {
    const page = pagination(req, res);

    if (!page) return;

    const users = db.prepare(`
      SELECT
        users.id,
        users.email,
        users.display_name AS displayName,
        users.role,
        c.id AS customerId,
        users.is_active AS isActive,
        users.created_at AS createdAt,
        users.updated_at AS updatedAt
      FROM users
      LEFT JOIN customers c ON c.user_id = users.id
      ORDER BY users.created_at DESC, users.id
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

  router.post("/admin/users", ...adminOnly, async (req, res) => {
    const input = parseInput(createUserSchema, req.body, res);

    if (!input) return;

    const now = new Date().toISOString();
    const id = randomUUID();
    const email = input.email.trim().toLowerCase();
    const passwordHash = await hashPassword(input.password);

    if (input.customerId) {
      const customer = db.prepare(`
        SELECT id, user_id AS userId
        FROM customers
        WHERE id = ?
      `).get(input.customerId) as { id: string; userId: string | null } | undefined;

      if (!customer) {
        res.status(404).json({ error: "Customer not found" });
        return;
      }

      if (customer.userId) {
        res.status(409).json({ error: "This customer already has a linked account" });
        return;
      }
    }

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

        if (input.customerId) {
          const link = db.prepare(`
            UPDATE customers
            SET user_id = ?
            WHERE id = ? AND user_id IS NULL
          `).run(id, input.customerId);

          if (link.changes !== 1) {
            throw new Error("CUSTOMER_ALREADY_LINKED");
          }
        }

        recordAuditEvent(db, {
          actor: req.user!,
          action: "user.created",
          targetType: "user",
          targetId: id,
          details: {
            email,
            displayName: input.displayName,
            role: input.role,
            ...(input.customerId ? { customerId: input.customerId } : {})
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

      if (error instanceof Error && error.message === "CUSTOMER_ALREADY_LINKED") {
        res.status(409).json({ error: "This customer already has a linked account" });
        return;
      }

      throw error;
    }

    const created = db.prepare(`
      SELECT
        users.id,
        users.email,
        users.display_name AS displayName,
        users.role,
        c.id AS customerId,
        users.is_active AS isActive,
        users.created_at AS createdAt,
        users.updated_at AS updatedAt
      FROM users
      LEFT JOIN customers c ON c.user_id = users.id
      WHERE users.id = ?
    `).get(id) as UserRow;

    res.status(201).json({
      user: userView(created)
    });
  });

  router.patch("/admin/users/:id", ...adminOnly, async (req, res) => {
    const input = parseInput(updateUserSchema, req.body, res);

    if (!input) return;

    const existing = db.prepare(`
      SELECT
        users.id,
        users.email,
        users.display_name AS displayName,
        users.password_hash AS passwordHash,
        users.role,
        c.id AS customerId,
        users.is_active AS isActive,
        users.created_at AS createdAt,
        users.updated_at AS updatedAt
      FROM users
      LEFT JOIN customers c ON c.user_id = users.id
      WHERE users.id = ?
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

    if (updatedRole !== "Customer" && input.customerId) {
      res.status(400).json({
        error: "Only Customer accounts can be linked to a customer record"
      });
      return;
    }

    const updatedCustomerId = updatedRole === "Customer"
      ? input.customerId ?? existing.customerId
      : null;

    if (updatedRole === "Customer" && !updatedCustomerId) {
      res.status(400).json({
        error: "A customer account must be linked to a customer record"
      });
      return;
    }

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
      customerId: updatedCustomerId,
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

    if (next.customerId !== existing.customerId) {
      changes.customerId = {
        from: existing.customerId,
        to: next.customerId
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

        if (next.customerId !== existing.customerId) {
          if (existing.customerId) {
            db.prepare(`
              UPDATE customers
              SET user_id = NULL
              WHERE id = ? AND user_id = ?
            `).run(existing.customerId, existing.id);
          }

          if (next.customerId) {
            const link = db.prepare(`
              UPDATE customers
              SET user_id = ?
              WHERE id = ? AND user_id IS NULL
            `).run(existing.id, next.customerId);

            if (link.changes !== 1) {
              const customerExists = db.prepare(
                "SELECT 1 AS found FROM customers WHERE id = ?"
              ).get(next.customerId);
              throw new Error(customerExists ? "CUSTOMER_ALREADY_LINKED" : "CUSTOMER_NOT_FOUND");
            }
          }
        }

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

      if (error instanceof Error && error.message === "CUSTOMER_ALREADY_LINKED") {
        res.status(409).json({ error: "This customer already has a linked account" });
        return;
      }

      if (error instanceof Error && error.message === "CUSTOMER_NOT_FOUND") {
        res.status(404).json({ error: "Customer not found" });
        return;
      }

      throw error;
    }

    const updated = db.prepare(`
      SELECT
        users.id,
        users.email,
        users.display_name AS displayName,
        users.role,
        c.id AS customerId,
        users.is_active AS isActive,
        users.created_at AS createdAt,
        users.updated_at AS updatedAt
      FROM users
      LEFT JOIN customers c ON c.user_id = users.id
      WHERE users.id = ?
    `).get(existing.id) as UserRow;

    res.json({
      user: userView(updated)
    });
  });
  router.get("/admin/audit-events", ...adminOnly, (req, res) => {
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

  return router;
}
