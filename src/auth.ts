import bcrypt from "bcryptjs";
import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import type { AppDatabase } from "./db";
import type { AuthenticatedUser, Role } from "./types";

interface TokenClaims extends jwt.JwtPayload {
  sub: string;
}

export function createToken(user: AuthenticatedUser, secret: string): string {
  return jwt.sign({ sub: user.id }, secret, { expiresIn: "1h" });
}

export function authentication(db: AppDatabase, secret: string): RequestHandler {
  return (req, res, next) => {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    let claims: TokenClaims;
    try {
      claims = jwt.verify(header.slice(7), secret) as TokenClaims;
    } catch {
      res.status(401).json({ error: "Invalid or expired access token" });
      return;
    }

    if (typeof claims.sub !== "string") {
      res.status(401).json({ error: "Invalid or expired access token" });
      return;
    }

    const row = db.prepare(`
      SELECT id, email, display_name AS displayName, role
      FROM users WHERE id = ? AND is_active = 1
    `).get(claims.sub) as
      | { id: string; email: string; displayName: string; role: Role }
      | undefined;

    if (!row) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    req.user = row;
    next();
  };
}

export function requireRoles(...allowed: Role[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!allowed.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
