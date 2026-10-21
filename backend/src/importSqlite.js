import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { migrate } from "./db/migrate.js";
import { pool, withTransaction } from "./db/postgres.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(
  process.argv[2] || path.join(here, "..", "data", "forcristina.sqlite")
);
const tables = [
  ["tenants", ["id", "created_at"]],
  ["admins", ["id", "tenant_id", "email", "password_hash", "name", "created_at"]],
  ["products", ["id", "tenant_id", "name", "purchase_price", "stock", "category", "description", "active", "created_at", "updated_at"]],
  ["clients", ["id", "tenant_id", "name", "phone", "address", "notes", "created_at", "updated_at"]],
  ["sales", ["id", "tenant_id", "client_id", "sale_date", "total", "notes", "created_at"]],
  ["sale_items", ["id", "tenant_id", "sale_id", "product_id", "quantity", "unit_price", "unit_cost", "subtotal"]],
  ["suppliers", ["id", "tenant_id", "name", "phone", "notes", "created_at", "updated_at"]],
  ["supplier_products", ["tenant_id", "supplier_id", "product_id", "purchase_price"]],
  ["purchase_orders", ["id", "tenant_id", "supplier_id", "supplier_name", "status", "created_at", "received_at"]],
  ["purchase_order_items", ["id", "tenant_id", "order_id", "product_id", "product_name", "quantity", "unit_price"]],
  ["company_settings", ["tenant_id", "name", "rut", "phone", "address", "updated_at"]],
];
const tablesWithIdentity = new Set([
  "tenants",
  "admins",
  "products",
  "clients",
  "sales",
  "sale_items",
  "suppliers",
  "purchase_orders",
  "purchase_order_items",
]);

const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
try {
  const sourceTables = new Set(
    source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name)
  );
  await migrate();
  const existing = await queryDestinationCount();
  if (existing > 0) {
    throw new Error("Supabase already contains tenant data; import stopped to prevent mixing records.");
  }

  const importedCounts = await withTransaction(async (client) => {
    const counts = {};
    const sourceTenantRows = sourceTables.has("tenants")
      ? source.prepare("SELECT id, created_at FROM tenants ORDER BY id").all()
      : [];
    const fallbackTenantId = Number(sourceTenantRows[0]?.id || 1);
    if (!sourceTenantRows.length) {
      await client.query(
        "INSERT INTO tenants (id) VALUES ($1) ON CONFLICT (id) DO NOTHING",
        [fallbackTenantId]
      );
      counts.tenants = 1;
    }
    for (const [table, targetColumns] of tables) {
      if (!sourceTables.has(table)) continue;
      const sourceColumns = new Set(
        source.prepare(`PRAGMA table_info("${table}")`).all().map((column) => column.name)
      );
      let sourceRows;
      if (table === "sale_items" && !sourceColumns.has("unit_cost")) {
        sourceRows = source.prepare(
          `SELECT si.*, COALESCE(p.purchase_price, 0) AS unit_cost
           FROM sale_items si
           LEFT JOIN products p
             ON p.tenant_id = si.tenant_id AND p.id = si.product_id`
        ).all();
        sourceColumns.add("unit_cost");
      } else {
        sourceRows = source.prepare(`SELECT * FROM "${table}"`).all();
      }
      if (!sourceRows.length) continue;

      const columns = targetColumns.filter((column) =>
        sourceColumns.has(column) || column === "tenant_id"
      );
      for (const row of sourceRows) {
        const values = columns.map((column) =>
          column === "tenant_id"
            ? (row.tenant_id ?? fallbackTenantId)
            : (row[column] ?? null)
        );
        const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
        const result = await client.query(
          `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(", ")})
           VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values
        );
        counts[table] = (counts[table] || 0) + result.rowCount;
      }
    }

    for (const [table] of tables) {
      if (!tablesWithIdentity.has(table)) continue;
      await client.query(
        `SELECT setval(
           pg_get_serial_sequence('${table}', 'id'),
           GREATEST(COALESCE((SELECT MAX(id) FROM "${table}"), 1), 1),
           COALESCE((SELECT MAX(id) FROM "${table}"), 0) > 0
         )`
      );
    }
    return counts;
  });
  console.log("SQLite import completed. Rows imported by table:", importedCounts);
} finally {
  source.close();
  await pool.end();
}

async function queryDestinationCount() {
  const { rows } = await pool.query("SELECT COUNT(*)::integer AS count FROM tenants");
  return Number(rows[0].count);
}
