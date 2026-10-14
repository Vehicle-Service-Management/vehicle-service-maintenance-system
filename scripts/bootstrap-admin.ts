import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "../src/auth";
import { recordAuditEvent } from "../src/audit";
import { openDatabase } from "../src/db";

async function main(): Promise<void> {
  const [emailArg, ...nameParts] = process.argv.slice(2);
  const email = emailArg?.trim().toLowerCase();
  const displayName = nameParts.join(" ").trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !displayName || !password || password.length < 12) {
    throw new Error("Usage: set BOOTSTRAP_ADMIN_PASSWORD (12+ characters), then run npm run bootstrap-admin -- <email> <display name>");
  }

  const db = openDatabase();
  try {
    const passwordHash = await hashPassword(password);
    const createAdmin = db.transaction(() => {
      const userCount = (db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number }).count;
      if (userCount > 0) throw new Error("Bootstrap is only available before any users exist");
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO users (id, email, display_name, password_hash, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'Administrator', ?, ?)
      `).run(id, email, displayName, passwordHash, now, now);
      recordAuditEvent(db, {
        actor: null,
        action: "user.bootstrap_created",
        targetType: "user",
        targetId: id,
        details: { email, displayName, role: "Administrator" }
      });
    });
    createAdmin();
    console.log(`Administrator account created for ${email}`);
  } finally {
    db.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
