import express from "express";
import { z } from "zod";
import { recordAuditEvent } from "../audit";
import { requireRoles } from "../auth";
import { createServiceRequestController } from "../controllers/service-request.controller";
import type { RouteContext } from "./context";
import { parseInput, pagination, serviceSelect, serviceStatuses, serviceView, ServiceRow, updateServiceStatusSchema } from "./shared";

const assignServiceSchema = z.object({
  technicianUserId: z.string().trim().min(1).max(100)
});

const updateExecutionSchema = z.object({
  workPerformed: z.string().trim().min(1).max(10000).optional(),
  notes: z.string().trim().max(5000).optional(),
  status: z.enum(["in_progress", "awaiting_parts", "completed"]).optional()
}).refine(
  (value) => Object.keys(value).length > 0,
  "Provide at least one execution field to update"
);

function canTechnicianAccess(userId: string, service: ServiceRow): boolean {
  return service.assignedTo === userId;
}

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
      } else if (req.user!.role === "Service Technician") {
        conditions.push("s.assigned_to = ?");
        conditions.push("s.review_status = 'validated'");
        conditions.push("s.status NOT IN ('completed', 'cancelled')");
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
        services: services.map((service) => serviceView(service, req.user!.role !== "Customer")),
        total,
        limit: page.limit,
        offset: page.offset
      });
    }
  );

  router.get(
    "/services/awaiting-assignment",
    authenticate,
    requireRoles("Administrator", "Service Advisor"),
    (req, res) => {
      const page = pagination(req, res);
      if (!page) return;

      const services = db.prepare(`
        ${serviceSelect}
        WHERE s.review_status = 'validated'
          AND s.status = 'received'
          AND s.assigned_to IS NULL
        ORDER BY s.created_at ASC, s.id
        LIMIT ? OFFSET ?
      `).all(page.limit, page.offset) as ServiceRow[];
      const total = (db.prepare(`
        SELECT COUNT(*) AS count
        FROM services
        WHERE review_status = 'validated'
          AND status = 'received'
          AND assigned_to IS NULL
      `).get() as { count: number }).count;

      res.json({
        services: services.map((service) => serviceView(service, true)),
        total,
        limit: page.limit,
        offset: page.offset
      });
    }
  );

  router.get(
    "/technicians",
    authenticate,
    requireRoles("Administrator", "Service Advisor"),
    (req, res) => {
      const page = pagination(req, res);
      if (!page) return;

      const technicians = db.prepare(`
        SELECT
          users.id,
          users.email,
          users.display_name AS displayName,
          (
            SELECT COUNT(*)
            FROM services
            WHERE assigned_to = users.id
              AND status NOT IN ('completed', 'cancelled')
          ) AS activeAssignments
        FROM users
        WHERE users.role = 'Service Technician'
          AND users.is_active = 1
        ORDER BY users.display_name COLLATE NOCASE, users.id
        LIMIT ? OFFSET ?
      `).all(page.limit, page.offset) as Array<{
        id: string;
        email: string;
        displayName: string;
        activeAssignments: number;
      }>;
      const total = (db.prepare(`
        SELECT COUNT(*) AS count
        FROM users
        WHERE role = 'Service Technician' AND is_active = 1
      `).get() as { count: number }).count;

      res.json({
        technicians,
        total,
        limit: page.limit,
        offset: page.offset
      });
    }
  );

  router.get(
    "/services/assigned",
    authenticate,
    requireRoles("Administrator", "Service Advisor", "Service Technician"),
    (req, res) => {
      const page = pagination(req, res);
      if (!page) return;

      const technicianFilter = req.user!.role === "Service Technician"
        ? "AND s.assigned_to = ?"
        : "";
      const parameters = req.user!.role === "Service Technician"
        ? [req.user!.id, page.limit, page.offset]
        : [page.limit, page.offset];
      const services = db.prepare(`
        ${serviceSelect}
        WHERE s.review_status = 'validated'
          AND s.assigned_to IS NOT NULL
          AND s.status NOT IN ('completed', 'cancelled')
          ${technicianFilter}
        ORDER BY s.updated_at DESC, s.id
        LIMIT ? OFFSET ?
      `).all(...parameters) as ServiceRow[];
      const countParameters = req.user!.role === "Service Technician"
        ? [req.user!.id]
        : [];
      const total = (db.prepare(`
        SELECT COUNT(*) AS count
        FROM services s
        WHERE s.review_status = 'validated'
          AND s.assigned_to IS NOT NULL
          AND s.status NOT IN ('completed', 'cancelled')
          ${technicianFilter}
      `).get(...countParameters) as { count: number }).count;

      res.json({
        services: services.map((service) => serviceView(service, true)),
        total,
        limit: page.limit,
        offset: page.offset
      });
    }
  );

  router.get(
    "/services/:id",
    authenticate,
    requireRoles("Administrator", "Service Advisor", "Service Technician", "Customer"),
    (req, res) => {
      const service = db.prepare(`${serviceSelect} WHERE s.id = ?`)
        .get(req.params.id) as ServiceRow | undefined;

      if (!service || (
        req.user!.role === "Customer" &&
        !db.prepare("SELECT 1 FROM customers WHERE id = ? AND user_id = ?")
          .get(service.customerId, req.user!.id)
      ) || (
        req.user!.role === "Service Technician" &&
        !canTechnicianAccess(req.user!.id, service)
      )) {
        res.status(404).json({ error: "Service request not found" });
        return;
      }

      res.json({ service: serviceView(service, req.user!.role !== "Customer") });
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

  router.post(
    "/services/:id/assign",
    authenticate,
    requireRoles("Administrator", "Service Advisor"),
    (req, res) => {
      const input = parseInput(assignServiceSchema, req.body, res);
      if (!input) return;

      const service = db.prepare(`${serviceSelect} WHERE s.id = ?`)
        .get(req.params.id) as ServiceRow | undefined;
      if (!service) {
        res.status(404).json({ error: "Service request not found" });
        return;
      }
      if (service.reviewStatus !== "validated" || service.status !== "received") {
        res.status(409).json({
          error: "Only validated requests awaiting assignment can be assigned"
        });
        return;
      }
      if (service.assignedTo) {
        res.status(409).json({ error: "This service request is already assigned" });
        return;
      }

      const technician = db.prepare(`
        SELECT id FROM users
        WHERE id = ? AND role = 'Service Technician' AND is_active = 1
      `).get(input.technicianUserId) as { id: string } | undefined;
      if (!technician) {
        res.status(400).json({
          error: "Assigned user must be an active Service Technician"
        });
        return;
      }

      const now = new Date().toISOString();
      const assignmentSaved = db.transaction(() => {
        const result = db.prepare(`
          UPDATE services
          SET assigned_to = ?, assigned_by = ?, assigned_at = ?,
              status = 'assigned', updated_at = ?
          WHERE id = ? AND review_status = 'validated'
            AND status = 'received' AND assigned_to IS NULL
        `).run(technician.id, req.user!.id, now, now, service.id);

        if (result.changes !== 1) {
          return false;
        }

        recordAuditEvent(db, {
          actor: req.user!,
          action: "service.assigned",
          targetType: "service",
          targetId: service.id,
          details: {
            assignedTo: technician.id,
            assignedBy: req.user!.id,
            assignedAt: now,
            from: "validated",
            to: "assigned"
          }
        });
        return true;
      })();
      if (!assignmentSaved) {
        res.status(409).json({
          error: "This service request is no longer available for assignment"
        });
        return;
      }

      const assigned = db.prepare(`${serviceSelect} WHERE s.id = ?`)
        .get(service.id) as ServiceRow;
      res.json({ service: serviceView(assigned, true) });
    }
  );

  router.patch(
    "/services/:id/execution",
    authenticate,
    requireRoles("Administrator", "Service Advisor", "Service Technician"),
    (req, res) => {
      const input = parseInput(updateExecutionSchema, req.body, res);
      if (!input) return;

      const service = db.prepare(`${serviceSelect} WHERE s.id = ?`)
        .get(req.params.id) as ServiceRow | undefined;
      if (!service) {
        res.status(404).json({ error: "Service request not found" });
        return;
      }
      if (service.reviewStatus !== "validated" || !service.assignedTo) {
        res.status(409).json({
          error: "Only validated and assigned requests can be updated during execution"
        });
        return;
      }
      if (
        req.user!.role === "Service Technician" &&
        !canTechnicianAccess(req.user!.id, service)
      ) {
        res.status(403).json({
          error: "Technicians may only update service requests assigned to them"
        });
        return;
      }
      if (["completed", "cancelled"].includes(service.status)) {
        res.status(409).json({
          error: "Completed or cancelled service requests cannot be changed"
        });
        return;
      }

      const status = input.status ?? service.status;
      const allowedTransitions: Record<string, string[]> = {
        assigned: ["in_progress"],
        in_progress: ["awaiting_parts", "completed"],
        awaiting_parts: ["in_progress", "completed"]
      };
      if (input.status && !allowedTransitions[service.status]?.includes(input.status)) {
        res.status(409).json({
          error: `Status cannot change from ${service.status} to ${input.status}`
        });
        return;
      }

      const workPerformed = input.workPerformed ?? service.workPerformed;
      const notes = input.notes ?? service.notes;
      if (status === "completed" && !workPerformed.trim()) {
        res.status(400).json({
          error: "Record the work performed before completing the service request"
        });
        return;
      }

      const now = new Date().toISOString();
      const completedAt = status === "completed" ? now : service.completedAt;
      const changes: Record<string, unknown> = {};
      if (workPerformed !== service.workPerformed) {
        changes.workPerformed = {
          from: service.workPerformed,
          to: workPerformed
        };
      }
      if (notes !== service.notes) {
        changes.notes = { from: service.notes, to: notes };
      }
      if (status !== service.status) {
        changes.status = { from: service.status, to: status };
      }

      if (Object.keys(changes).length === 0) {
        res.json({ service: serviceView(service, true) });
        return;
      }

      db.transaction(() => {
        db.prepare(`
          UPDATE services
          SET work_performed = ?, service_notes = ?, status = ?,
              completed_at = ?, updated_at = ?
          WHERE id = ?
        `).run(workPerformed, notes, status, completedAt, now, service.id);

        recordAuditEvent(db, {
          actor: req.user!,
          action: status === "completed"
            ? "service.completed"
            : "service.execution_updated",
          targetType: "service",
          targetId: service.id,
          details: {
            ...changes,
            ...(status === "completed" ? { completedAt } : {})
          }
        });
      })();

      const updated = db.prepare(`${serviceSelect} WHERE s.id = ?`)
        .get(service.id) as ServiceRow;
      res.json({ service: serviceView(updated, true) });
    }
  );

  router.patch(
    "/services/:id/status",
    authenticate,
    requireRoles("Administrator", "Service Advisor", "Service Technician"),
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

      if (
        req.user!.role === "Service Technician" &&
        !canTechnicianAccess(req.user!.id, service)
      ) {
        res.status(403).json({
          error: "Technicians may only update service requests assigned to them"
        });
        return;
      }

      if (["completed", "cancelled"].includes(service.status)) {
        res.status(409).json({ error: "Completed or cancelled services cannot be changed" });
        return;
      }

      if (
        req.user!.role === "Service Technician" &&
        input.status === "cancelled"
      ) {
        res.status(403).json({
          error: "Technicians cannot cancel service requests"
        });
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
      res.json({ service: serviceView(updated, true) });
    }
  );

  return router;
}
