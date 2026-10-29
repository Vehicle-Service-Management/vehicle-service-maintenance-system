import express from "express";
import { z } from "zod";
import { recordAuditEvent } from "../audit";
import { requireRoles } from "../auth";
import { createServiceRequestController } from "../controllers/service-request.controller";
import type { RouteContext } from "./context";
import { parseInput, pagination, serviceSelect, serviceStatuses, serviceView, ServiceRow, updateServiceStatusSchema } from "./shared";

export function createServicesRouter(context: RouteContext) {
  const router = express.Router();
  const { db, authenticate } = context;
  const requestController = createServiceRequestController(db);

  router.get(
    "/services",
    authenticate,
    requireRoles("Administrator", "Service Advisor", "Customer"),
    (req, res) => {
      const page = pagination(req, res);
      if (!page) return;

      const filter = parseInput(
        z.object({
          status: z.enum([
            "submitted",
            "validated",
            "rejected",
            ...serviceStatuses
          ]).optional()
        }),
        { status: req.query.status },
        res
      );
      if (!filter) return;

      const conditions: string[] = [];
      const values: Array<string | number> = [];

      if (filter.status === "submitted" || filter.status === "rejected") {
        conditions.push("s.review_status = ?");
        values.push(filter.status);
      } else if (filter.status === "validated") {
        conditions.push("s.review_status = 'validated' AND s.status = 'received'");
      } else if (filter.status && filter.status !== "received") {
        conditions.push("s.status = ? AND s.review_status = 'validated'");
        values.push(filter.status);
      } else if (filter.status === "received") {
        conditions.push("s.status = 'received' AND s.review_status = 'submitted'");
      }

      if (req.user!.role === "Customer") {
        conditions.push("v.customer_id = (SELECT id FROM customers WHERE user_id = ?)");
        values.push(req.user!.id);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const services = db.prepare(`
        ${serviceSelect}
        ${where}
        ORDER BY s.created_at DESC, s.id
        LIMIT ? OFFSET ?
      `).all(...values, page.limit, page.offset) as ServiceRow[];
      const total = (db.prepare(`
        SELECT COUNT(*) AS count
        FROM services s
        LEFT JOIN vehicles v ON v.id = s.vehicle_id
        ${where}
      `).get(...values) as { count: number }).count;

      res.json({
        services: services.map(serviceView),
        total,
        limit: page.limit,
        offset: page.offset
      });
    }
  );

  router.get(
    "/services/:id",
    authenticate,
    requireRoles("Administrator", "Service Advisor", "Customer"),
    (req, res) => {
      const service = db.prepare(`${serviceSelect} WHERE s.id = ?`)
        .get(req.params.id) as ServiceRow | undefined;

      if (!service || (
        req.user!.role === "Customer" &&
        !db.prepare("SELECT 1 FROM customers WHERE id = ? AND user_id = ?")
          .get(service.customerId, req.user!.id)
      )) {
        res.status(404).json({ error: "Service request not found" });
        return;
      }

      res.json({ service: serviceView(service) });
    }
  );

  router.post(
    "/services",
    authenticate,
    requireRoles("Administrator", "Service Advisor", "Customer"),
    requestController.create
  );

  router.patch(
    "/services/:id",
    authenticate,
    requireRoles("Administrator", "Service Advisor", "Customer"),
    requestController.update
  );

  router.patch(
    "/services/:id/review",
    authenticate,
    requireRoles("Administrator", "Service Advisor"),
    requestController.review
  );

  router.patch(
    "/services/:id/status",
    authenticate,
    requireRoles("Administrator", "Service Advisor"),
    (req, res) => {
      const input = parseInput(updateServiceStatusSchema, req.body, res);

      if (!input) return;

      const service = db.prepare(`${serviceSelect} WHERE s.id = ?`)
        .get(req.params.id) as ServiceRow | undefined;

      if (!service) {
        res.status(404).json({
          error: "Service request not found"
        });

        return;
      }

      if (service.reviewStatus !== "validated" || service.status === "received") {
        res.status(409).json({
          error: "A service request must be validated and assigned before its service status changes"
        });
        return;
      }

      if (["received", "assigned", "completed"].includes(input.status)) {
        res.status(400).json({
          error: "Use the review, assignment, or execution operation for that status"
        });
        return;
      }

      if (["completed", "cancelled"].includes(service.status)) {
        res.status(409).json({ error: "Completed or cancelled services cannot be changed" });
        return;
      }

      const allowedTransitions: Record<string, string[]> = {
        assigned: ["in_progress", "cancelled"],
        in_progress: ["awaiting_parts", "cancelled"],
        awaiting_parts: ["in_progress", "cancelled"]
      };
      if (!allowedTransitions[service.status]?.includes(input.status)) {
        res.status(409).json({
          error: `Status cannot change from ${service.status} to ${input.status}`
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

      const updated = db.prepare(`${serviceSelect} WHERE s.id = ?`)
        .get(service.id) as ServiceRow;
      res.json({ service: serviceView(updated) });
    }
  );

  return router;
}
