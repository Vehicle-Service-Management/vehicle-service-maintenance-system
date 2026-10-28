import express from "express";
import { randomUUID } from "node:crypto";
import { recordAuditEvent } from "../audit";
import { requireRoles } from "../auth";
import type { RouteContext } from "./context";
import { createVehicleSchema, parseInput, updateVehicleSchema, VehicleRow, pagination } from "./shared";

export function createVehiclesRouter(context: RouteContext) {
  const router = express.Router();
  const { db, authenticate } = context;

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
      `).all(req.params.id) as VehicleRow[];

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
