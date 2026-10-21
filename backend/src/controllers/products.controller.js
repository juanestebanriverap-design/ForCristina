import { z } from "zod";
import { query } from "../db/postgres.js";

const ProductCreate = z.object({
  name: z.string().min(1),
  purchase_price: z.number().positive(),
  stock: z.number().int().nonnegative().optional().default(0),
  category: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

const ProductUpdate = ProductCreate.partial();

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
    const { rows } = await query(
      `
      INSERT INTO products (tenant_id, name, purchase_price, stock, category, description)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
      `,
      [tenantId, p.name, p.purchase_price, p.stock, p.category ?? null, p.description ?? null]
    );

    res.status(201).json({ id: Number(rows[0].id), ...p });
  } catch (err) {
    // Nota: ya no es UNIQUE por name global (si lo dejaste así en DB, te chocará entre tenants).
    // En SaaS lo ideal es UNIQUE(tenant_id, name) en la tabla.
    if (err?.code === "23505") {
      return res.status(409).json({ message: "Ya existe un producto con ese nombre." });
    }
    return res.status(500).json({ message: "Error creando producto." });
  }
}

export async function updateProduct(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const id = Number(req.params.id);

  const parsed = ProductUpdate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);

  const p = parsed.data;

  const existingResult = await query(
    "SELECT id FROM products WHERE tenant_id = $1 AND id = $2 LIMIT 1",
    [tenantId, id]
  );
  const existing = existingResult.rows[0];

  if (!existing) return res.status(404).json({ message: "Not found" });

  await query(
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
    id
    ]
  );

  const { rows } = await query(
    "SELECT * FROM products WHERE tenant_id = $1 AND id = $2 LIMIT 1",
    [tenantId, id]
  );

  res.json(rows[0]);
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