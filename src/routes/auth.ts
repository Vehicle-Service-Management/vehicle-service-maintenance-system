import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import express from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { recordAuditEvent } from "../audit";
import { createToken, hashPassword, verifyPassword } from "../auth";
import type { AuthenticatedUser, Role } from "../types";
import type { RouteContext } from "./context";
import { createCustomerSchema, emailSchema, parseInput, passwordSchema } from "./shared";

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function createAuthRouter(context: RouteContext) {
  const router = express.Router();
  const { db, jwtSecret } = context;

  router.post(
    "/auth/register",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: "draft-8",
      legacyHeaders: false
    }),
    async (req, res) => {
      const input = parseInput(
        createCustomerSchema.extend({ password: passwordSchema }),
        req.body,
        res
      );
      if (!input) return;

      const email = input.email.trim().toLowerCase();
      const name = input.name.trim();
      const phone = input.phone.trim();
      const address = input.address?.trim() || null;
      let customerId = "";
      let linkedExistingCustomer = false;
      const userId = randomUUID();
      const now = new Date().toISOString();
      const passwordHash = await hashPassword(input.password);
      const user: AuthenticatedUser = {
        id: userId,
        email,
        displayName: name,
        role: "Customer"
      };

      try {
        db.transaction(() => {
          const existingCustomer = db.prepare(`
            SELECT id, name, user_id AS userId
            FROM customers
            WHERE email = ? COLLATE NOCASE
          `).get(email) as { id: string; name: string; userId: string | null } | undefined;

          if (existingCustomer?.userId) {
            throw new Error("CUSTOMER_ALREADY_LINKED");
          }
          if (
            existingCustomer &&
            normalizeName(existingCustomer.name) !== normalizeName(name)
          ) {
            throw new Error("CUSTOMER_DETAILS_MISMATCH");
          }

          customerId = existingCustomer?.id ?? randomUUID();
          linkedExistingCustomer = Boolean(existingCustomer);

          db.prepare(`
            INSERT INTO users (
              id, email, display_name, password_hash, role, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'Customer', ?, ?)
          `).run(userId, email, name, passwordHash, now, now);

          if (existingCustomer) {
            const link = db.prepare(`
              UPDATE customers SET user_id = ?, updated_at = ?
              WHERE id = ? AND user_id IS NULL
            `).run(userId, now, existingCustomer.id);
            if (link.changes !== 1) throw new Error("CUSTOMER_ALREADY_LINKED");
          } else {
            db.prepare(`
              INSERT INTO customers (
                id, name, email, phone, address, user_id, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(customerId, name, email, phone, address, userId, now, now);
          }

          recordAuditEvent(db, {
            actor: user,
            action: "user.self_registered",
            targetType: "user",
            targetId: userId,
            details: { role: "Customer", customerId, linkedExistingCustomer }
          });
        })();
      } catch (error) {
        if (error instanceof Error && error.message === "CUSTOMER_ALREADY_LINKED") {
          res.status(409).json({
            error: "This customer record already has an account. Sign in with that account or contact the service centre for help."
          });
          return;
        }
        if (error instanceof Error && error.message === "CUSTOMER_DETAILS_MISMATCH") {
          res.status(409).json({
            error: "The email matches an existing customer record, but the name does not. Use the name on your customer record or contact the service centre for help."
          });
          return;
        }
        if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
          res.status(409).json({
            error: "An account with this email already exists. Sign in or contact the service centre for help."
          });
          return;
        }
        throw error;
      }

      res.status(201).json({
        accessToken: createToken(user, jwtSecret),
        tokenType: "Bearer",
        expiresIn: 3600,
        user
      });
    }
  );

  router.post(
    "/auth/login",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 30,
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

  return router;
}
