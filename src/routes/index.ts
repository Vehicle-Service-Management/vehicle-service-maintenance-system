import express from "express";
import type { AppDatabase } from "../db";
import { createAdminRouter } from "./admin";
import { createAuthRouter } from "./auth";
import { createRouteContext } from "./context";
import { createCustomersRouter } from "./customers";
import { createServicesRouter } from "./services";
import { createVehiclesRouter } from "./vehicles";

export function createApiRouter(db: AppDatabase, jwtSecret: string) {
  if (jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }

  const router = express.Router();
  const context = createRouteContext(db, jwtSecret);

  router.use(createAuthRouter(context));
  router.use(createAdminRouter(context));
  router.use(createCustomersRouter(context));
  router.use(createVehiclesRouter(context));
  router.use(createServicesRouter(context));

  return router;
}
