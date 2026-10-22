import pg from "pg";

const { Pool } = pg;
pg.types.setTypeParser(20, (value) => Number(value));
pg.types.setTypeParser(1700, (value) => Number(value));

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to connect to Supabase PostgreSQL.");
}

const caCertificate = process.env.DATABASE_CA_CERT_BASE64
  ? Buffer.from(process.env.DATABASE_CA_CERT_BASE64, "base64").toString("utf8")
  : undefined;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable"
    ? false
    : { rejectUnauthorized: true, ...(caCertificate ? { ca: caCertificate } : {}) },
  max: Number(process.env.DB_POOL_SIZE || 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export async function query(text, values = []) {
  return pool.query(text, values);
}

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
