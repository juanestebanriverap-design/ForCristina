import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool, withTransaction } from "./db/postgres.js";

const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;
const name = process.env.SEED_ADMIN_NAME;
if (!email || !password || !name) {
  throw new Error("Set SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, and SEED_ADMIN_NAME.");
}

const hash = await bcrypt.hash(password, 10);
try {
  const admin = await withTransaction(async (client) => {
    const tenantResult = await client.query("INSERT INTO tenants DEFAULT VALUES RETURNING id");
    const result = await client.query(
      `INSERT INTO admins (tenant_id, email, password_hash, name)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [tenantResult.rows[0].id, email, hash, name]
    );
    return result.rows[0];
  });
  console.log(`Admin created with id ${admin.id}.`);
} finally {
  await pool.end();
}