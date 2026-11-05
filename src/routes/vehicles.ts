import express from "express";
import { randomUUID } from "node:crypto";
import { recordAuditEvent } from "../audit";
import { requireRoles } from "../auth";
import type { RouteContext } from "./context";
import { createMaintenanceRecordSchema, createVehicleSchema, parseInput, updateVehicleSchema, VehicleRow, pagination } from "./shared";

export function createVehiclesRouter(context: RouteContext) {
  const router = express.Router();
  const { db, authenticate } = context;

  const searchPattern = (value: unknown) => `%${String(value ?? "").trim().replace(/[\\%_]/g, "\\$&")}%`;

  router.get("/vehicles", authenticate, requireRoles("Administrator", "Service Advisor"), (req, res) => {
    const page = pagination(req, res);
    if (!page) return;
    const pattern = searchPattern(req.query.search);
    const sql = ` FROM vehicles v JOIN customers c ON c.id = v.customer_id
      WHERE (? = '%%' OR v.registration_number LIKE ? ESCAPE '\\' COLLATE NOCASE
        OR v.make LIKE ? ESCAPE '\\' COLLATE NOCASE OR v.model LIKE ? ESCAPE '\\' COLLATE NOCASE
        OR c.name LIKE ? ESCAPE '\\' COLLATE NOCASE)`;
    const values = [pattern, pattern, pattern, pattern, pattern];
    const vehicles = db.prepare(`SELECT v.id, v.customer_id AS customerId,
      v.registration_number AS registrationNumber, v.make, v.model, v.year,
      v.created_at AS createdAt, v.updated_at AS updatedAt${sql}
      ORDER BY v.created_at DESC, v.id LIMIT ? OFFSET ?`)
      .all(...values, page.limit, page.offset) as VehicleRow[];
    const total = (db.prepare(`SELECT COUNT(*) AS count${sql}`).get(...values) as { count: number }).count;
    res.json({ vehicles, total, limit: page.limit, offset: page.offset });
  });

  router.post("/vehicles/:id/maintenance", authenticate, requireRoles("Administrator", "Service Advisor"), (req, res) => {
    const input = parseInput(createMaintenanceRecordSchema, req.body, res);
    if (!input) return;
    const vehicle = db.prepare("SELECT id FROM vehicles WHERE id = ?").get(req.params.id) as { id: string } | undefined;
    if (!vehicle) { res.status(404).json({ error: "Vehicle not found" }); return; }
    if (input.serviceId) {
      const service = db.prepare("SELECT id FROM services WHERE id = ? AND vehicle_id = ? AND status = 'completed'")
        .get(input.serviceId, vehicle.id) as { id: string } | undefined;
      if (!service) { res.status(400).json({ error: "Service must be completed and belong to this vehicle" }); return; }
    }
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    db.transaction(() => {
      db.prepare(`INSERT INTO maintenance_records (id, vehicle_id, maintenance_date, details, service_id, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, vehicle.id, input.maintenanceDate, input.details, input.serviceId ?? null, req.user!.id, createdAt);
      recordAuditEvent(db, { actor: req.user!, action: "vehicle.maintenance_recorded", targetType: "vehicle", targetId: vehicle.id,
        details: { maintenanceRecordId: id, maintenanceDate: input.maintenanceDate, serviceId: input.serviceId ?? null } });
    })();
    res.status(201).json({ record: { id, vehicleId: vehicle.id, maintenanceDate: input.maintenanceDate, details: input.details, serviceId: input.serviceId ?? null, createdAt } });
  });

  router.get("/vehicles/:id/history", authenticate, requireRoles("Administrator", "Service Advisor", "Customer"), (req, res) => {
    const vehicle = db.prepare("SELECT id, customer_id AS customerId FROM vehicles WHERE id = ?")
      .get(req.params.id) as { id: string; customerId: string } | undefined;
    if (!vehicle || (req.user!.role === "Customer" && !db.prepare("SELECT 1 FROM customers WHERE id = ? AND user_id = ?").get(vehicle.customerId, req.user!.id))) {
      res.status(404).json({ error: "Vehicle not found" }); return;
    }
    const serviceRecords = db.prepare(`SELECT s.id, s.vehicle_id AS vehicleId, s.service_type AS serviceType,
      s.description, s.request_date AS requestDate, s.status, s.work_performed AS workPerformed,
      s.service_notes AS notes, s.completed_at AS completedAt FROM services s
      WHERE s.vehicle_id = ? ORDER BY s.created_at DESC, s.id`).all(vehicle.id);
    const maintenanceRecords = db.prepare(`SELECT id, vehicle_id AS vehicleId,
      maintenance_date AS maintenanceDate, details, service_id AS serviceId, created_at AS createdAt
      FROM maintenance_records WHERE vehicle_id = ? ORDER BY maintenance_date DESC, created_at DESC`).all(vehicle.id);
    res.json({ vehicleId: vehicle.id, serviceRecords, maintenanceRecords });
  });

  // Let a customer select only vehicles linked to their own profile.
  router.get(
    "/me/vehicles",
    authenticate,
    requireRoles("Customer"),
    (req, res) => {
      const customer = db.prepare(`
        SELECT id
        FROM customers
        WHERE user_id = ?
      `).get(req.user!.id) as { id: string } | undefined;

      if (!customer) {
        res.status(403).json({ error: "Customer account is not linked to a customer record" });
        return;
      }

      const search = String(req.query.search ?? "").trim();
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
      `).all(customer.id) as VehicleRow[];

      res.json({
        customerId: customer.id,
        vehicles,
        total: vehicles.length
      });
    }
  );

  // Register a vehicle for an existing customer.
  router.post(
    "/vehicles",
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
  router.get(
    "/customers/:id/vehicles",
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

      const search = String(req.query.search ?? "").trim();
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
        WHERE customer_id = ? AND (? = '' OR registration_number LIKE ? COLLATE NOCASE
          OR make LIKE ? COLLATE NOCASE OR model LIKE ? COLLATE NOCASE)
        ORDER BY created_at DESC, id
      `).all(req.params.id, search, `%${search}%`, `%${search}%`, `%${search}%`) as VehicleRow[];

      res.json({
        customerId: req.params.id,
        vehicles,
        total: vehicles.length
      });
    }
  );

  // View a specific vehicle.
  router.get(
    "/vehicles/:id",
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
  router.patch(
    "/vehicles/:id",
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

  return router;
}
