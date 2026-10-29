import express from "express";
import { z } from "zod";
import { roles, type Role } from "../types";

export const serviceStatuses = [
  "received",
  "assigned",
  "in_progress",
  "awaiting_parts",
  "completed",
  "cancelled"
] as const;

export const emailSchema = z.email().max(254);

export const passwordSchema = z
  .string()
  .min(12)
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Password must be at most 72 UTF-8 bytes"
  );

export const createUserSchema = z.object({
  email: emailSchema,
  displayName: z.string().trim().min(1).max(100),
  password: passwordSchema,
  role: z.enum(roles),
  customerId: z.string().trim().min(1).optional()
}).superRefine((value, context) => {
  if (value.role === "Customer" && !value.customerId) {
    context.addIssue({
      code: "custom",
      path: ["customerId"],
      message: "A customer account must be linked to a customer record"
    });
  }

  if (value.role !== "Customer" && value.customerId) {
    context.addIssue({
      code: "custom",
      path: ["customerId"],
      message: "Only Customer accounts can be linked to a customer record"
    });
  }
});

export const updateUserSchema = z.object({
  email: emailSchema.optional(),
  displayName: z.string().trim().min(1).max(100).optional(),
  password: passwordSchema.optional(),
  role: z.enum(roles).optional(),
  isActive: z.boolean().optional(),
  customerId: z.string().trim().min(1).optional()
}).refine(
  (value) => Object.keys(value).length > 0,
  "Provide at least one field to update"
);

export const createServiceSchema = z.object({
  vehicleId: z.string().trim().min(1),
  serviceType: z.string().trim().max(40).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional()
});

export const updateServiceRequestSchema = z.object({
  vehicleId: z.string().trim().min(1).optional(),
  serviceType: z.string().trim().max(40).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional()
}).refine(
  (value) => Object.keys(value).length > 0,
  "Provide at least one field to update"
);

export const reviewServiceSchema = z.object({
  decision: z.enum(["validate", "reject"]),
  reason: z.string().trim().min(1).max(500).optional()
}).superRefine((value, context) => {
  if (value.decision === "reject" && !value.reason) {
    context.addIssue({
      code: "custom",
      path: ["reason"],
      message: "A rejection reason is required"
    });
  }
});

export const updateServiceStatusSchema = z.object({
  status: z.enum(serviceStatuses)
});

// Customer validation schemas

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  phone: z.string().trim().min(7).max(20),
  address: z.string().trim().max(250).optional()
});

export const updateCustomerSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: emailSchema.optional(),
  phone: z.string().trim().min(7).max(20).optional(),
  address: z.string().trim().max(250).nullable().optional()
}).refine(
  (value) => Object.keys(value).length > 0,
  "Provide at least one field to update"
);

export interface UserRow {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  customerId: string | null;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditRow {
  id: string;
  actorUserId: string | null;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  detailsJson: string;
  createdAt: string;
}

export interface CustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface VehicleRow {
  id: string;
  customerId: string;
  registrationNumber: string;
  make: string;
  model: string;
  year: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRow {
  id: string;
  vehicleId: string | null;
  customerId: string | null;
  serviceType: string | null;
  description: string;
  status: typeof serviceStatuses[number];
  reviewStatus: "submitted" | "validated" | "rejected";
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const serviceSelect = `
  SELECT
    s.id,
    s.vehicle_id AS vehicleId,
    v.customer_id AS customerId,
    s.service_type AS serviceType,
    s.description,
    s.status,
    s.review_status AS reviewStatus,
    s.reviewed_by AS reviewedBy,
    s.reviewed_at AS reviewedAt,
    s.rejection_reason AS rejectionReason,
    s.created_by AS createdBy,
    s.created_at AS createdAt,
    s.updated_at AS updatedAt
  FROM services s
  LEFT JOIN vehicles v ON v.id = s.vehicle_id
`;

export function serviceView(row: ServiceRow): Omit<ServiceRow, "reviewStatus" | "status"> & { status: string } {
  const status = row.reviewStatus === "submitted" || row.reviewStatus === "rejected"
    ? row.reviewStatus
    : row.status === "received"
      ? "validated"
      : row.status;
  const { reviewStatus: _reviewStatus, ...service } = row;

  return { ...service, status };
}

export function parseInput<T>(
  schema: z.ZodType<T>,
  input: unknown,
  res: express.Response
): T | undefined {
  const result = schema.safeParse(input);

  if (!result.success) {
    res.status(400).json({
      error: "Invalid request",
      details: result.error.issues.map(({ path, message }) => ({
        path,
        message
      }))
    });

    return undefined;
  }

  return result.data;
}

export function userView(
  row: UserRow
): Omit<UserRow, "isActive"> & { isActive: boolean } {
  const { isActive, ...user } = row;

  return {
    ...user,
    isActive: Boolean(isActive)
  };
}

export function pagination(
  req: express.Request,
  res: express.Response
): { limit: number; offset: number } | undefined {
  const schema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(100000).default(0)
  });

  return parseInput(schema, req.query, res);
}

// ============================================================
// VEHICLE VALIDATION SCHEMAS - ISSUE #10
// ============================================================

export const currentYear = new Date().getFullYear();

export const createVehicleSchema = z.object({
  customerId: z.string().trim().min(1, "Customer ID is required"),

  registrationNumber: z
    .string()
    .trim()
    .min(1, "Registration number is required")
    .max(20)
    .regex(
      /^[A-Za-z0-9 -]+$/,
      "Registration number contains invalid characters"
    ),

  make: z.string().trim().min(1, "Vehicle make is required").max(60),

  model: z.string().trim().min(1, "Vehicle model is required").max(60),

  year: z.coerce
    .number()
    .int("Year must be a whole number")
    .min(1886, "Vehicle year is invalid")
    .max(currentYear + 1, "Vehicle year cannot be in the future")
});

export const updateVehicleSchema = z
  .object({
    registrationNumber: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .regex(/^[A-Za-z0-9 -]+$/)
      .optional(),

    make: z.string().trim().min(1).max(60).optional(),

    model: z.string().trim().min(1).max(60).optional(),

    year: z.coerce
      .number()
      .int()
      .min(1886)
      .max(currentYear + 1)
      .optional()
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one field to update"
  );
