import { z } from "zod";
import { isPostgres, query, withTransaction } from "../db/postgres.js";
import { addInventoryLot, adjustInventory } from "../inventory/fifo.js";

const ProductCreate = z.object({
  name: z.string().trim().min(1),
  purchase_price: z.number().positive(),
  stock: z.number().int().nonnegative().optional().default(0),
  category: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

const ProductUpdate = ProductCreate.partial();

async function ensureUniqueProductName(client, tenantId, name, productId) {
  const normalizedName = name.trim().toLowerCase();
  if (isPostgres) {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`${tenantId}:${normalizedName}`]
    );
  }
  const values = productId === undefined
    ? [tenantId, normalizedName]
    : [tenantId, normalizedName, productId];
  const result = await client.query(
    `SELECT id FROM products
     WHERE tenant_id = $1 AND LOWER(TRIM(name)) = $2
       ${productId === undefined ? "" : "AND id <> $3"}
     LIMIT 1`,
    values
  );
  if (result.rows[0]) {
    const error = new Error("Ya existe un producto con ese nombre.");
    error.status = 409;
    throw error;
  }
}

export async function listProducts(req, res) {
  const tenantId = Number(req.user?.tenantId);

  const { rows } = await query(
    "SELECT * FROM products WHERE tenant_id = $1 AND active = 1 ORDER BY id DESC",
    [tenantId]
  );

  res.json(rows);
}

export async function getProduct(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const id = Number(req.params.id);

  const { rows } = await query(
    "SELECT * FROM products WHERE tenant_id = $1 AND id = $2 LIMIT 1",
    [tenantId, id]
  );
  const row = rows[0];

  if (!row) return res.status(404).json({ message: "Not found" });
  res.json(row);
}

export async function createProduct(req, res) {
  const tenantId = Number(req.user?.tenantId);

  const parsed = ProductCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);

  const p = parsed.data;

  try {
    const product = await withTransaction(async (client) => {
      await ensureUniqueProductName(client, tenantId, p.name);
      const { rows } = await client.query(
        `INSERT INTO products (tenant_id, name, purchase_price, stock, category, description)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [tenantId, p.name, p.purchase_price, p.stock, p.category ?? null, p.description ?? null]
      );
      const id = Number(rows[0].id);
      await addInventoryLot(client, tenantId, id, p.stock, p.purchase_price);
      return id;
    });
    res.status(201).json({ id: product, ...p });
  } catch (err) {
    if (
      err.status === 409 ||
      err?.code === "23505" ||
      err?.message?.includes("duplicate_product_name")
    ) {
      return res.status(409).json({ message: "Ya existe un producto con ese nombre." });
    }
    console.error("Failed to create product:", err);
    return res.status(500).json({ message: "Error creando producto." });
  }
}

export async function updateProduct(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const id = Number(req.params.id);

  const parsed = ProductUpdate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);

  const p = parsed.data;

  try {
    const updated = await withTransaction(async (client) => {
      if (p.name !== undefined) await ensureUniqueProductName(client, tenantId, p.name, id);
      const existingResult = await client.query(
        "SELECT id, stock, purchase_price FROM products WHERE tenant_id = $1 AND id = $2 LIMIT 1 FOR UPDATE",
        [tenantId, id]
      );
      const existing = existingResult.rows[0];
      if (!existing) {
        const error = new Error("Not found");
        error.status = 404;
        throw error;
      }

      const nextStock = p.stock ?? Number(existing.stock);
      const nextPurchasePrice = p.purchase_price ?? Number(existing.purchase_price);
      await adjustInventory(
        client,
        tenantId,
        id,
        Number(existing.stock),
        nextStock,
        nextPurchasePrice
      );
      await client.query(
        `UPDATE products SET
          name = COALESCE($1, name),
          purchase_price = COALESCE($2, purchase_price),
          stock = COALESCE($3, stock),
          category = COALESCE($4, category),
          description = COALESCE($5, description),
          updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $6 AND id = $7`,
        [
          p.name ?? null,
          p.purchase_price ?? null,
          p.stock ?? null,
          p.category ?? null,
          p.description ?? null,
          tenantId,
          id,
        ]
      );
      const { rows } = await client.query(
        "SELECT * FROM products WHERE tenant_id = $1 AND id = $2 LIMIT 1",
        [tenantId, id]
      );
      return rows[0];
    });
    return res.json(updated);
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ message: error.message });
    if (
      error.status === 409 ||
      error?.code === "23505" ||
      error?.message?.includes("duplicate_product_name")
    ) {
      return res.status(409).json({
        message: error?.message?.includes("duplicate_product_name")
          ? "Ya existe un producto con ese nombre."
          : error.message,
      });
    }
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Ya existe un producto con ese nombre." });
    }
    console.error("Failed to update product:", error);
    return res.status(500).json({ message: "Error actualizando producto." });
  }
}

export async function deleteProduct(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const id = Number(req.params.id);

  const existingResult = await query(
    "SELECT id FROM products WHERE tenant_id = $1 AND id = $2 LIMIT 1",
    [tenantId, id]
  );
  const existing = existingResult.rows[0];

  if (!existing) return res.status(404).json({ message: "Not found" });

  try {
    await query(
      "UPDATE products SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = $1 AND id = $2",
      [tenantId, id]
    );

    return res.status(204).send();
  } catch (err) {
    if (err?.code === "23503") {
      return res.status(409).json({
        message:
          "No se puede eliminar: el producto está asociado a registros (por ejemplo ventas/movimientos).",
      });
    }
    console.error(err);
    return res.status(500).json({ message: "Error eliminando producto." });
  }
}