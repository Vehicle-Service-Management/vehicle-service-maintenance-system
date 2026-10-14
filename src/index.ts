import "dotenv/config";
import { createApp } from "./app";
import { openDatabase } from "./db";

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  throw new Error("Set JWT_SECRET to a random value of at least 32 characters");
}

const db = openDatabase();
const app = createApp(db, secret);
const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => console.log(`Vehicle service API listening on port ${port}`));

function shutdown(): void {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
