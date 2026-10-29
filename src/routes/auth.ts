import bcrypt from "bcryptjs";
import express from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { recordAuditEvent } from "../audit";
import { createToken, verifyPassword } from "../auth";
import type { AuthenticatedUser, Role } from "../types";
import type { RouteContext } from "./context";
import { emailSchema, parseInput } from "./shared";

export function createAuthRouter(context: RouteContext) {
  const router = express.Router();
  const { db, jwtSecret } = context;

  router.post(
    "/auth/login",
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

  return router;
}
