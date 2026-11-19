import "dotenv/config";
import app from "./app.js";
import { migrate } from "./db/migrate.js";
import { pool } from "./db/postgres.js";

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is required in production.");
}

await migrate();

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || "0.0.0.0";

const server = app.listen(PORT, HOST, () => {
  console.log(`API running on ${HOST}:${PORT}`);
});

function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);