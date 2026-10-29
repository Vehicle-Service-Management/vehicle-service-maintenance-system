import express from "express";
import { randomUUID } from "node:crypto";
import { recordAuditEvent } from "../audit";
import { requireRoles } from "../auth";
import type { RouteContext } from "./context";
import { createCustomerSchema, CustomerRow, parseInput, pagination, updateCustomerSchema } from "./shared";

export function createCustomersRouter(context: RouteContext) {
  const router = express.Router();
  const { db, authenticate } = context;

  // Register a customer.
  router.post(
    "/customers",
    authenticate,
    requireRoles("Administrator", "Service Advisor"),
    (req, res) => {
      const input = parseInput(createCustomerSchema, req.body, res);

      if (!input) return;

      const id = randomUUID();
      const now = new Date().toISOString();
      const email = input.email.trim().toLowerCase();
      const phone = input.phone.trim();
      const address = input.address?.trim() || null;

      try {
        db.transaction(() => {
          db.prepare(`
            INSERT INTO customers (
              id,
              name,
              email,
              phone,
              address,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            id,
            input.name,
            email,
            phone,
            address,
            now,
            now
          );

          recordAuditEvent(db, {
            actor: req.user!,
            action: "customer.created",
            targetType: "customer",
            targetId: id,
            details: {
              name: input.name,
              email
            }
          });
        })();
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("UNIQUE constraint failed: customers.email")
        ) {
          res.status(409).json({
            error: "A customer with this email already exists"
          });

          return;
        }

        throw error;
      }

      res.status(201).json({
        customer: {
          id,
          name: input.name,
          email,
          phone,
          address,
          createdAt: now,
          updatedAt: now
        }
      });
    }
  );

  // List customers with pagination.
  router.get(
    "/customers",
    authenticate,
    requireRoles("Administrator", "Service Advisor"),
    (req, res) => {
      const page = pagination(req, res);

      if (!page) return;

      const customers = db.prepare(`
        SELECT
          id,
          name,
          email,
          phone,
          address,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM customers
        ORDER BY created_at DESC, id
        LIMIT ? OFFSET ?
      `).all(page.limit, page.offset) as CustomerRow[];

      const total = (
        db.prepare("SELECT COUNT(*) AS count FROM customers").get() as {
          count: number;
        }
      ).count;

      res.json({
        customers,
        total,
        limit: page.limit,
        offset: page.offset
      });
    }
  );

  // View an individual customer.
  router.get(
    "/customers/:id",
    authenticate,
    requireRoles("Administrator", "Service Advisor"),
    (req, res) => {
      const customer = db.prepare(`
        SELECT
          id,
          name,
          email,
          phone,
          address,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM customers
        WHERE id = ?
      `).get(req.params.id) as CustomerRow | undefined;

      if (!customer) {
        res.status(404).json({
          error: "Customer not found"
        });

        return;
      }

      res.json({
        customer
      });
    }
  );

  // Update an individual customer's information.
  router.patch(
    "/customers/:id",
    authenticate,
    requireRoles("Administrator", "Service Advisor"),
    (req, res) => {
      const input = parseInput(updateCustomerSchema, req.body, res);

      if (!input) return;

      const existing = db.prepare(`
        SELECT
          id,
          name,
          email,
          phone,
          address,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM customers
        WHERE id = ?
      `).get(req.params.id) as CustomerRow | undefined;

      if (!existing) {
        res.status(404).json({
          error: "Customer not found"
        });

        return;
      }

      const next = {
        name: input.name ?? existing.name,
        email: input.email?.trim().toLowerCase() ?? existing.email,
        phone: input.phone?.trim() ?? existing.phone,
        address: input.address === undefined
          ? existing.address
          : input.address?.trim() || null,
        updatedAt: new Date().toISOString()
      };

      const changes: Record<string, unknown> = {};

      if (next.name !== existing.name) {
        changes.name = {
          from: existing.name,
          to: next.name
        };
      }

      if (next.email !== existing.email) {
        changes.email = {
          from: existing.email,
          to: next.email
        };
      }

      if (next.phone !== existing.phone) {
        changes.phone = {
          from: existing.phone,
          to: next.phone
        };
      }

      if (next.address !== existing.address) {
        changes.address = {
          from: existing.address,
          to: next.address
        };
      }

      try {
        db.transaction(() => {
          db.prepare(`
            UPDATE customers
            SET
              name = ?,
              email = ?,
              phone = ?,
              address = ?,
              updated_at = ?
            WHERE id = ?
          `).run(
            next.name,
            next.email,
            next.phone,
            next.address,
            next.updatedAt,
            existing.id
          );

          if (Object.keys(changes).length > 0) {
            recordAuditEvent(db, {
              actor: req.user!,
              action: "customer.updated",
              targetType: "customer",
              targetId: existing.id,
              details: changes
            });
          }
        })();
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("UNIQUE constraint failed: customers.email")
        ) {
          res.status(409).json({
            error: "A customer with this email already exists"
          });

          return;
        }

        throw error;
      }

      res.json({
        customer: {
          ...existing,
          ...next
        }
      });
    }
  );

  return router;
}
