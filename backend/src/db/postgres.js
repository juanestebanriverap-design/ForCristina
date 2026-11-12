import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const isPostgres = Boolean(process.env.DATABASE_URL);

if (process.env.NODE_ENV === "production" && !isPostgres) {
  throw new Error("DATABASE_URL is required in production; SQLite is for local development only.");
}

let pgPool;
let sqlite;
let sqliteQueue = Promise.resolve();

if (isPostgres) {
  const pg = await import("pg");
  pg.default.types.setTypeParser(20, (value) => Number(value));
  pg.default.types.setTypeParser(1700, (value) => Number(value));

  const caCertificate = process.env.DATABASE_CA_CERT_BASE64
    ? Buffer.from(process.env.DATABASE_CA_CERT_BASE64, "base64").toString("utf8")
    : undefined;

  pgPool = new pg.default.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === "disable"
      ? false
      : { rejectUnauthorized: true, ...(caCertificate ? { ca: caCertificate } : {}) },
    max: Number(process.env.DB_POOL_SIZE || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
} else {
  const { default: Database } = await import("better-sqlite3");
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const dataDir = process.env.APP_DATA_DIR || path.resolve(currentDir, "../../data");
  fs.mkdirSync(dataDir, { recursive: true });

  sqlite = new Database(path.join(dataDir, "forcristina.sqlite"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
}

async function withSqliteLock(callback) {
  const previous = sqliteQueue;
  let release;
  sqliteQueue = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await callback();
  } finally {
    release();
  }
}

function prepareSqliteQuery(text, values) {
  const parameters = [];
  const sql = text.replace(
    /([\w.]+)\s*=\s*ANY\(\$(\d+)::bigint\[\]\)|\$(\d+)::date|([\w.]+)::date|::integer|\$(\d+)/g,
    (match, column, arrayIndex, dateParameter, dateColumn, parameterIndex) => {
      if (column && arrayIndex) {
        const ids = values[Number(arrayIndex) - 1];
        if (!Array.isArray(ids) || ids.length === 0) return `${column} IN (NULL)`;
        parameters.push(...ids);
        return `${column} IN (${ids.map(() => "?").join(", ")})`;
      }
      if (dateParameter) {
        parameters.push(values[Number(dateParameter) - 1]);
        return "date(?)";
      }
      if (dateColumn) return `date(${dateColumn})`;
      if (match === "::integer") return "";
      parameters.push(values[Number(parameterIndex) - 1]);
      return "?";
    }
  )
    .replace(/\s+FOR\s+(?:UPDATE|SHARE)\b/gi, "")
    .replace(/CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*'(\d+\s+\w+)'/gi, (_, interval) =>
      `datetime(CURRENT_TIMESTAMP, '-${interval}')`
    );
  return { sql, parameters };
}

function querySqlite(text, values = []) {
  const { sql, parameters } = prepareSqliteQuery(text, values);
  const statement = sqlite.prepare(sql);
  if (statement.reader) {
    const rows = statement.all(...parameters);
    return { rows, rowCount: rows.length };
  }
  const result = statement.run(...parameters);
  return { rows: [], rowCount: result.changes, lastInsertRowid: result.lastInsertRowid };
}

export const pool = {
  query: (text, values = []) =>
    isPostgres ? pgPool.query(text, values) : withSqliteLock(() => querySqlite(text, values)),
  connect: () => pgPool.connect(),
  end: async () => {
    if (isPostgres) await pgPool.end();
    else sqlite.close();
  },
};

export async function query(text, values = []) {
  return pool.query(text, values);
}

export async function withTransaction(callback) {
  if (isPostgres) {
    const client = await pgPool.connect();
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

  return withSqliteLock(async () => {
    querySqlite("BEGIN");
    try {
      const result = await callback({ query: querySqlite });
      querySqlite("COMMIT");
      return result;
    } catch (error) {
      querySqlite("ROLLBACK");
      throw error;
    }
  });
}

export async function execute(sql) {
  if (isPostgres) return pgPool.query(sql);
  return withSqliteLock(() => sqlite.exec(sql));
}

export async function sqliteHasColumn(table, column) {
  if (isPostgres) return true;
  return withSqliteLock(() =>
    sqlite.prepare(`PRAGMA table_info("${table}")`).all().some((entry) => entry.name === column)
  );
}
