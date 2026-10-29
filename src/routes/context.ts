import type { RequestHandler } from "express";
import { authentication, requireRoles } from "../auth";
import type { AppDatabase } from "../db";

export interface RouteContext {
  db: AppDatabase;
  jwtSecret: string;
  authenticate: RequestHandler;
  adminOnly: RequestHandler[];
}

export function createRouteContext(db: AppDatabase, jwtSecret: string): RouteContext {
  const authenticateRequest = authentication(db, jwtSecret);
  return {
    db,
    jwtSecret,
    authenticate: authenticateRequest,
    adminOnly: [authenticateRequest, requireRoles("Administrator")]
  };
}
