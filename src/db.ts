import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type AppDatabase = Database.Database;

export function initializeDatabase(db: AppDatabase): void {
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('Customer', 'Service Advisor', 'Service Technician', 'Administrator')),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('received', 'assigned', 'in_progress', 'awaiting_parts', 'completed', 'cancelled')),
      created_by TEXT NOT NULL REFERENCES users(id),
      assigned_to TEXT REFERENCES users(id),
      work_performed TEXT NOT NULL DEFAULT '',
      service_notes TEXT NOT NULL DEFAULT '',
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      actor_email TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at, id);
    CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_events(created_at DESC, id);
    CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_events(target_type, target_id);
    CREATE TRIGGER IF NOT EXISTS audit_events_no_update
      BEFORE UPDATE ON audit_events
      BEGIN
        SELECT RAISE(ABORT, 'audit events are immutable');
      END;
    CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
      BEFORE DELETE ON audit_events
      BEGIN
        SELECT RAISE(ABORT, 'audit events are immutable');
      END;
  `);

  const serviceColumns = db.prepare("PRAGMA table_info(services)").all() as Array<{ name: string }>;
  const existingColumns = new Set(serviceColumns.map(({ name }) => name));
  if (!existingColumns.has("assigned_to")) {
    db.exec("ALTER TABLE services ADD COLUMN assigned_to TEXT REFERENCES users(id)");
  }
  if (!existingColumns.has("work_performed")) {
    db.exec("ALTER TABLE services ADD COLUMN work_performed TEXT NOT NULL DEFAULT ''");
  }
  if (!existingColumns.has("service_notes")) {
    db.exec("ALTER TABLE services ADD COLUMN service_notes TEXT NOT NULL DEFAULT ''");
  }
  if (!existingColumns.has("completed_at")) {
    db.exec("ALTER TABLE services ADD COLUMN completed_at TEXT");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_services_assigned_to ON services(assigned_to, status)");
}

export function openDatabase(databasePath = process.env.DATABASE_PATH ?? "./data/app.sqlite"): AppDatabase {
  const path = resolve(databasePath);
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  initializeDatabase(db);
  return db;
}
