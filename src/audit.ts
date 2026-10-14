import { randomUUID } from "node:crypto";
import type { AppDatabase } from "./db";
import type { AuthenticatedUser } from "./types";

export interface AuditEventInput {
  actor: AuthenticatedUser | null;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
}

export function recordAuditEvent(db: AppDatabase, event: AuditEventInput): void {
  db.prepare(`
    INSERT INTO audit_events
      (id, actor_user_id, actor_email, actor_role, action, target_type, target_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    event.actor?.id ?? null,
    event.actor?.email ?? "system",
    event.actor?.role ?? "system",
    event.action,
    event.targetType,
    event.targetId,
    JSON.stringify(event.details),
    new Date().toISOString()
  );
}
