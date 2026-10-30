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
      role TEXT NOT NULL CHECK (
        role IN (
          'Customer',
          'Service Advisor',
          'Service Technician',
          'Administrator'
        )
      ),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      vehicle_id TEXT REFERENCES vehicles(id),
      service_type TEXT,
      status TEXT NOT NULL CHECK (
        status IN (
          'received',
          'assigned',
          'in_progress',
          'awaiting_parts',
          'completed',
          'cancelled'
        )
      ),
      review_status TEXT NOT NULL DEFAULT 'submitted' CHECK (
        review_status IN ('submitted', 'validated', 'rejected')
      ),
      reviewed_by TEXT REFERENCES users(id),
      reviewed_at TEXT,
      rejection_reason TEXT,
      assigned_to TEXT REFERENCES users(id),
      assigned_by TEXT REFERENCES users(id),
      assigned_at TEXT,
      work_performed TEXT NOT NULL DEFAULT '',
      service_notes TEXT NOT NULL DEFAULT '',
      completed_at TEXT,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      phone TEXT NOT NULL,
      address TEXT,
      user_id TEXT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      registration_number TEXT NOT NULL COLLATE NOCASE UNIQUE,
      make TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER NOT NULL CHECK (year BETWEEN 1886 AND 2100),
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

    CREATE INDEX IF NOT EXISTS idx_users_created_at
      ON users(created_at, id);

    CREATE INDEX IF NOT EXISTS idx_audit_created_at
      ON audit_events(created_at DESC, id);

    CREATE INDEX IF NOT EXISTS idx_audit_target
      ON audit_events(target_type, target_id);

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

  ensureColumn(db, "services", "vehicle_id", "TEXT REFERENCES vehicles(id)");
  ensureColumn(db, "services", "service_type", "TEXT");
  ensureColumn(
    db,
    "services",
    "review_status",
    "TEXT NOT NULL DEFAULT 'submitted' CHECK (review_status IN ('submitted', 'validated', 'rejected'))"
  );
  ensureColumn(db, "services", "reviewed_by", "TEXT REFERENCES users(id)");
  ensureColumn(db, "services", "reviewed_at", "TEXT");
  ensureColumn(db, "services", "rejection_reason", "TEXT");
  ensureColumn(db, "services", "assigned_to", "TEXT REFERENCES users(id)");
  ensureColumn(db, "services", "assigned_by", "TEXT REFERENCES users(id)");
  ensureColumn(db, "services", "assigned_at", "TEXT");
  ensureColumn(db, "services", "work_performed", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "services", "service_notes", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "services", "completed_at", "TEXT");
  ensureColumn(db, "customers", "user_id", "TEXT REFERENCES users(id) ON DELETE SET NULL");

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_user_id
      ON customers(user_id) WHERE user_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_customers_created_at
      ON customers(created_at, id);
    CREATE INDEX IF NOT EXISTS idx_vehicles_customer_id
      ON vehicles(customer_id, created_at, id);
    CREATE INDEX IF NOT EXISTS idx_services_vehicle_created_at
      ON services(vehicle_id, created_at, id);
    CREATE INDEX IF NOT EXISTS idx_services_review_queue
      ON services(review_status, created_at, id);
    CREATE INDEX IF NOT EXISTS idx_services_assigned_work
      ON services(assigned_to, status, updated_at);
  `);
}

function ensureColumn(
  db: AppDatabase,
  table: string,
  column: string,
  definition: string
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;

  if (!columns.some((existing) => existing.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function openDatabase(
  databasePath = process.env.DATABASE_PATH ?? "./data/app.sqlite"
): AppDatabase {
  const path = resolve(databasePath);

  mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);

  initializeDatabase(db);

  return db;
}
