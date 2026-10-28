import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { recordAuditEvent } from "../audit";
import type { AppDatabase } from "../db";
import {
  createServiceSchema,
  parseInput,
  reviewServiceSchema,
  serviceSelect,
  serviceView,
  ServiceRow,
  updateServiceRequestSchema
} from "../routes/shared";

export function createServiceRequestController(db: AppDatabase) {
  const create: RequestHandler = (req, res) => {
    const input = parseInput(createServiceSchema, req.body, res);

    if (!input) return;

    const vehicle = db.prepare(`
      SELECT id, customer_id AS customerId
      FROM vehicles
      WHERE id = ?
    `).get(input.vehicleId) as { id: string; customerId: string } | undefined;

    if (!vehicle) {
      res.status(404).json({ error: "Registered vehicle not found" });
      return;
    }

    if (req.user!.role === "Customer") {
      const ownsVehicle = db.prepare(`
        SELECT 1
        FROM customers
        WHERE id = ? AND user_id = ?
      `).get(vehicle.customerId, req.user!.id);

      if (!ownsVehicle) {
        res.status(403).json({ error: "You can only request service for your own vehicle" });
        return;
      }
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const serviceType = input.serviceType?.trim() || null;
    const description = input.description?.trim() || "";

    db.transaction(() => {
      db.prepare(`
        INSERT INTO services (
          id,
          vehicle_id,
          service_type,
          description,
          status,
          review_status,
          created_by,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, 'received', 'submitted', ?, ?, ?)
      `).run(
        id,
        vehicle.id,
        serviceType,
        description,
        req.user!.id,
        now,
        now
      );

      recordAuditEvent(db, {
        actor: req.user!,
        action: "service.request_submitted",
        targetType: "service",
        targetId: id,
        details: {
          status: "submitted",
          vehicleId: vehicle.id,
          serviceType
        }
      });
    })();

    const created = db.prepare(`${serviceSelect} WHERE s.id = ?`)
      .get(id) as ServiceRow;
    res.status(201).json({
      service: serviceView(created)
    });
  };

  const update: RequestHandler = (req, res) => {
    const input = parseInput(updateServiceRequestSchema, req.body, res);
    if (!input) return;

    const existing = db.prepare(`${serviceSelect} WHERE s.id = ?`)
      .get(req.params.id) as ServiceRow | undefined;

    if (!existing || (
      req.user!.role === "Customer" &&
      !db.prepare("SELECT 1 FROM customers WHERE id = ? AND user_id = ?")
        .get(existing.customerId, req.user!.id)
    )) {
      res.status(404).json({ error: "Service request not found" });
      return;
    }

    if (existing.reviewStatus === "validated" || existing.status !== "received") {
      res.status(409).json({ error: "Only unassigned requests can be corrected or resubmitted" });
      return;
    }

    const vehicleId = input.vehicleId ?? existing.vehicleId;
    const vehicle = vehicleId
      ? db.prepare("SELECT id, customer_id AS customerId FROM vehicles WHERE id = ?")
          .get(vehicleId) as { id: string; customerId: string } | undefined
      : undefined;

    if (!vehicle) {
      res.status(404).json({ error: "Registered vehicle not found" });
      return;
    }

    if (req.user!.role === "Customer") {
      const ownsVehicle = db.prepare(`
        SELECT 1 FROM customers WHERE id = ? AND user_id = ?
      `).get(vehicle.customerId, req.user!.id);

      if (!ownsVehicle) {
        res.status(403).json({ error: "You can only request service for your own vehicle" });
        return;
      }
    }

    const next = {
      vehicleId: vehicle.id,
      serviceType: input.serviceType === undefined
        ? existing.serviceType
        : input.serviceType?.trim() || null,
      description: input.description === undefined
        ? existing.description
        : input.description?.trim() || ""
    };
    const changes: Record<string, unknown> = {};
    for (const key of ["vehicleId", "serviceType", "description"] as const) {
      if (next[key] !== existing[key]) {
        changes[key] = { from: existing[key], to: next[key] };
      }
    }

    const resubmitting = existing.reviewStatus === "rejected";
    if (Object.keys(changes).length === 0 && !resubmitting) {
      res.json({ service: serviceView(existing) });
      return;
    }

    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare(`
        UPDATE services
        SET vehicle_id = ?, service_type = ?, description = ?,
            review_status = 'submitted', reviewed_by = NULL,
            reviewed_at = NULL, rejection_reason = NULL, updated_at = ?
        WHERE id = ?
      `).run(next.vehicleId, next.serviceType, next.description, now, existing.id);

      recordAuditEvent(db, {
        actor: req.user!,
        action: resubmitting ? "service.request_resubmitted" : "service.request_updated",
        targetType: "service",
        targetId: existing.id,
        details: changes
      });
    })();

    const updated = db.prepare(`${serviceSelect} WHERE s.id = ?`)
      .get(existing.id) as ServiceRow;
    res.json({ service: serviceView(updated) });
  };

  const review: RequestHandler = (req, res) => {
    const input = parseInput(reviewServiceSchema, req.body, res);
    if (!input) return;

    const service = db.prepare(`${serviceSelect} WHERE s.id = ?`)
      .get(req.params.id) as ServiceRow | undefined;

    if (!service) {
      res.status(404).json({ error: "Service request not found" });
      return;
    }

    if (service.reviewStatus !== "submitted" || service.status !== "received") {
      res.status(409).json({ error: "Only submitted service requests can be reviewed" });
      return;
    }

    if (input.decision === "validate") {
      const missing: Array<{ path: string; message: string }> = [];
      if (!service.vehicleId || !service.customerId) {
        missing.push({ path: "vehicleId", message: "Select a registered vehicle" });
      }
      if (!service.serviceType?.trim()) {
        missing.push({ path: "serviceType", message: "Service type is required" });
      }
      if (!service.description.trim()) {
        missing.push({ path: "description", message: "Description is required" });
      }

      if (missing.length > 0) {
        res.status(400).json({
          error: "Service request is incomplete",
          details: missing
        });
        return;
      }
    }

    const now = new Date().toISOString();
    const reviewStatus = input.decision === "validate" ? "validated" : "rejected";
    const reason = input.decision === "reject" ? input.reason!.trim() : null;

    db.transaction(() => {
      db.prepare(`
        UPDATE services
        SET review_status = ?, reviewed_by = ?, reviewed_at = ?,
            rejection_reason = ?, updated_at = ?
        WHERE id = ?
      `).run(reviewStatus, req.user!.id, now, reason, now, service.id);

      recordAuditEvent(db, {
        actor: req.user!,
        action: input.decision === "validate"
          ? "service.request_validated"
          : "service.request_rejected",
        targetType: "service",
        targetId: service.id,
        details: {
          from: "submitted",
          to: reviewStatus,
          ...(reason ? { reason } : {})
        }
      });
    })();

    const reviewed = db.prepare(`${serviceSelect} WHERE s.id = ?`)
      .get(service.id) as ServiceRow;
    res.json({ service: serviceView(reviewed) });
  };

  return { create, update, review };
}
