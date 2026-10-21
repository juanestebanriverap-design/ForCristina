import "dotenv/config";
import app from "./app.js";
import { migrate } from "./db/migrate.js";
import { purgeExpiredSales } from "./controllers/sales.controller.js";
import { pool } from "./db/postgres.js";

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is required in production.");
}

await migrate();
await purgeExpiredSales();

const salesCleanupInterval = setInterval(async () => {
  try {
    await purgeExpiredSales();
  } catch (error) {
    console.error("Failed to remove sales older than 45 days:", error);
  }
}, 60 * 60 * 1000);
salesCleanupInterval.unref();

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || "0.0.0.0";

const server = app.listen(PORT, HOST, () => {
  console.log(`API running on ${HOST}:${PORT}`);
});

function shutdown() {
  clearInterval(salesCleanupInterval);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);