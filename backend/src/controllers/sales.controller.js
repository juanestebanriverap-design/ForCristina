import { z } from "zod";
import { query, withTransaction } from "../db/postgres.js";

const SaleCreate = z.object({
  client_id: z.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        product_id: z.number().int(),
        quantity: z.number().int().positive(),
        unit_price: z.number().positive(),
      })
    )
    .min(1),
});

const SaleUpdate = SaleCreate;

async function recomputeSaleTotal(client, tenantId, saleId) {
  const result = await client.query(
    "SELECT COALESCE(SUM(subtotal), 0) AS total FROM sale_items WHERE tenant_id = $1 AND sale_id = $2",
    [tenantId, saleId]
  );
  const total = Number(Number(result.rows[0].total || 0).toFixed(2));
  await client.query(
    "UPDATE sales SET total = $1 WHERE tenant_id = $2 AND id = $3",
    [total, tenantId, saleId]
  );
  return total;
}

export async function createSale(req, res) {
  const tenantId = Number(req.user?.tenantId);

  const parsed = SaleCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);

  const { client_id, notes, items } = parsed.data;

  // Si viene client_id, valida que sea del mismo tenant
  if (client_id != null) {
    const { rows } = await query(
      "SELECT id FROM clients WHERE tenant_id = $1 AND id = $2 LIMIT 1",
      [tenantId, client_id]
    );
    const c = rows[0];
    if (!c) return res.status(400).json({ message: "Cliente inválido" });
  }

  const itemsWithSubtotal = items.map((i) => ({
    ...i,
    subtotal: Number((i.quantity * i.unit_price).toFixed(2)),
  }));
  const total = Number(itemsWithSubtotal.reduce((a, i) => a + i.subtotal, 0).toFixed(2));

  try {
    const saleId = await withTransaction(async (client) => {
      const saleResult = await client.query(
        `INSERT INTO sales (tenant_id, client_id, total, notes)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [tenantId, client_id ?? null, total, notes ?? null]
      );
      const newSaleId = Number(saleResult.rows[0].id);
      const quantities = new Map();
      for (const item of items) {
        quantities.set(item.product_id, (quantities.get(item.product_id) || 0) + item.quantity);
      }

      const productIds = [...quantities.keys()].sort((left, right) => left - right);
      const { rows: lockedProducts } = await client.query(
        `SELECT id, stock, purchase_price FROM products
         WHERE tenant_id = $1 AND id = ANY($2::bigint[])
         ORDER BY id FOR UPDATE`,
        [tenantId, productIds]
      );
      const products = new Map(lockedProducts.map((product) => [Number(product.id), product]));
      for (const [productId, quantity] of quantities) {
        const product = products.get(productId);
        if (!product) throw new Error(`Producto inválido: ${productId}`);
        if (items.some((item) =>
          item.product_id === productId && Number(item.unit_price) < Number(product.purchase_price)
        )) {
          throw new Error(`Precio de venta inválido para el producto ${productId}.`);
        }
        if (Number(product.stock) < quantity) {
          throw new Error(`No hay stock suficiente para el producto ${productId}`);
        }
        products.set(productId, product);
      }

      for (const item of itemsWithSubtotal) {
        await client.query(
          `INSERT INTO sale_items
           (tenant_id, sale_id, product_id, quantity, unit_price, unit_cost, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            tenantId,
            newSaleId,
            item.product_id,
            item.quantity,
            item.unit_price,
            Number(products.get(item.product_id).purchase_price),
            item.subtotal,
          ]
        );
      }
      for (const [productId, quantity] of quantities) {
        await client.query(
          `UPDATE products SET stock = stock - $1, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = $2 AND id = $3`,
          [quantity, tenantId, productId]
        );
      }
      return newSaleId;
    });

    return res.status(201).json({ id: saleId, total });
  } catch (e) {
    return res.status(400).json({ message: e.message || "Sale failed" });
  }
}

export async function updateSale(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const saleId = Number(req.params.id);
  if (!Number.isInteger(saleId) || saleId < 1) {
    return res.status(400).json({ message: "Invalid sale id" });
  }

  const parsed = SaleUpdate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);

  const { client_id, notes, items } = parsed.data;
  if (client_id != null) {
    const { rows } = await query(
      "SELECT id FROM clients WHERE tenant_id = $1 AND id = $2 LIMIT 1",
      [tenantId, client_id]
    );
    const client = rows[0];
    if (!client) return res.status(400).json({ message: "Cliente inválido" });
  }

  try {
    const result = await withTransaction(async (client) => {
      const saleResult = await client.query(
        "SELECT id, notes FROM sales WHERE tenant_id = $1 AND id = $2 FOR UPDATE",
        [tenantId, saleId]
      );
      const sale = saleResult.rows[0];
      if (!sale) {
        const err = new Error("Factura no encontrada.");
        err.status = 404;
        throw err;
      }

      const previousItemsResult = await client.query(
        `SELECT product_id, quantity, unit_cost
         FROM sale_items WHERE tenant_id = $1 AND sale_id = $2`,
        [tenantId, saleId]
      );
      const previousItems = previousItemsResult.rows;
      const previousQuantities = new Map();
      const previousCosts = new Map();
      for (const item of previousItems) {
        previousQuantities.set(
          item.product_id,
          (previousQuantities.get(item.product_id) || 0) + Number(item.quantity)
        );
        if (!previousCosts.has(item.product_id)) {
          previousCosts.set(item.product_id, Number(item.unit_cost));
        }
      }

      const newQuantities = new Map();
      for (const item of items) {
        newQuantities.set(
          item.product_id,
          (newQuantities.get(item.product_id) || 0) + item.quantity
        );
      }

      const productIds = [...new Set([...previousQuantities.keys(), ...newQuantities.keys()])]
        .sort((left, right) => left - right);
      const { rows: lockedProducts } = await client.query(
        `SELECT id, stock, purchase_price FROM products
         WHERE tenant_id = $1 AND id = ANY($2::bigint[])
         ORDER BY id FOR UPDATE`,
        [tenantId, productIds]
      );
      const products = new Map(lockedProducts.map((product) => [Number(product.id), product]));
      const productDetails = new Map();
      for (const [productId, quantity] of newQuantities) {
        const product = products.get(productId);
        if (!product) throw new Error(`Producto inválido: ${productId}`);

        const availableStock = Number(product.stock) + (previousQuantities.get(productId) || 0);
        if (availableStock < quantity) {
          throw new Error(`No hay stock suficiente para el producto ${productId}`);
        }

        const unitCost = previousCosts.has(productId)
          ? previousCosts.get(productId)
          : Number(product.purchase_price);
        if (items.some((item) => item.product_id === productId && item.unit_price < unitCost)) {
          throw new Error(
            `Precio de venta inválido para el producto ${productId}. Mínimo permitido: ${unitCost}`
          );
        }
        productDetails.set(productId, { product, unitCost });
      }

      for (const productId of new Set([...previousQuantities.keys(), ...newQuantities.keys()])) {
        const quantityDelta =
          (previousQuantities.get(productId) || 0) - (newQuantities.get(productId) || 0);
        if (quantityDelta !== 0) {
          await client.query(
            `UPDATE products SET stock = stock + $1, updated_at = CURRENT_TIMESTAMP
             WHERE tenant_id = $2 AND id = $3`,
            [quantityDelta, tenantId, productId]
          );
        }
      }

      await client.query(
        "DELETE FROM sale_items WHERE tenant_id = $1 AND sale_id = $2",
        [tenantId, saleId]
      );

      let total = 0;
      for (const item of items) {
        const subtotal = Number((item.quantity * item.unit_price).toFixed(2));
        total += subtotal;
        await client.query(
          `INSERT INTO sale_items
           (tenant_id, sale_id, product_id, quantity, unit_price, unit_cost, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            tenantId,
            saleId,
            item.product_id,
            item.quantity,
            item.unit_price,
            productDetails.get(item.product_id).unitCost,
            subtotal,
          ]
        );
      }
      total = Number(total.toFixed(2));

      await client.query(
        `UPDATE sales
         SET client_id = $1, total = $2, notes = $3
         WHERE tenant_id = $4 AND id = $5`,
        [client_id ?? null, total, notes ?? sale.notes ?? null, tenantId, saleId]
      );

      return { id: saleId, total };
    });

    return res.json(result);
  } catch (error) {
    return res
      .status(error.status || 400)
      .json({ message: error.message || "No se pudo actualizar la factura." });
  }
}

export async function listSales(req, res) {
  const tenantId = Number(req.user?.tenantId);

  const { rows } = await query(
    `
      SELECT s.*, c.name AS client_name
      FROM sales s
      LEFT JOIN clients c
        ON c.id = s.client_id
       AND c.tenant_id = s.tenant_id
      WHERE s.tenant_id = $1
        AND s.sale_date >= CURRENT_TIMESTAMP - INTERVAL '10 days'
      ORDER BY s.sale_date DESC, s.id DESC
      `,
    [tenantId]
  );

  res.json(rows);
}

export async function purgeExpiredSales() {
  const result = await query(
    "DELETE FROM sales WHERE sale_date < CURRENT_TIMESTAMP - INTERVAL '45 days'"
  );
  return result.rowCount;
}

/**
 * GET /api/sales/:id
 */
export async function getSale(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const id = Number(req.params.id);

  const saleResult = await query(
    "SELECT * FROM sales WHERE tenant_id = $1 AND id = $2 LIMIT 1",
    [tenantId, id]
  );
  const sale = saleResult.rows[0];

  if (!sale) return res.status(404).json({ message: "Not found" });

  const { rows: items } = await query(
      `
      SELECT si.*, p.name AS product_name
      FROM sale_items si
      JOIN products p
        ON p.id = si.product_id
       AND p.tenant_id = si.tenant_id
      WHERE si.tenant_id = $1
        AND si.sale_id = $2
      ORDER BY si.id ASC
      `,
      [tenantId, id]
  );

  return res.json({ ...sale, items });
}

const SaleItemQtyPatch = z.object({
  quantity: z.number().int().min(1),
});

/**
 * PATCH /api/sales/:saleId/items/:itemId
 */
export async function updateSaleItemQuantity(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const saleId = Number(req.params.saleId);
  const itemId = Number(req.params.itemId);

  if (!Number.isFinite(saleId) || !Number.isFinite(itemId)) {
    return res.status(400).json({ message: "Invalid saleId/itemId" });
  }

  const parsed = SaleItemQtyPatch.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);

  const { quantity: newQty } = parsed.data;

  try {
    const result = await withTransaction(async (client) => {
      const saleResult = await client.query(
        "SELECT id FROM sales WHERE tenant_id = $1 AND id = $2 LIMIT 1 FOR UPDATE",
        [tenantId, saleId]
      );
      if (!saleResult.rows[0]) {
        const err = new Error("Sale not found");
        err.status = 404;
        throw err;
      }
      const itemResult = await client.query(
          `
          SELECT id, tenant_id, sale_id, product_id, quantity, unit_price
          FROM sale_items
          WHERE tenant_id = $1 AND id = $2 AND sale_id = $3
          LIMIT 1 FOR UPDATE
          `,
          [tenantId, itemId, saleId]
      );
      const item = itemResult.rows[0];

      if (!item) {
        const err = new Error("Sale item not found");
        err.status = 404;
        throw err;
      }

      const oldQty = Number(item.quantity);
      const delta = Number(newQty) - oldQty;

      if (delta !== 0) {
        const productResult = await client.query(
          "SELECT id, stock FROM products WHERE tenant_id = $1 AND id = $2 LIMIT 1 FOR UPDATE",
          [tenantId, item.product_id]
        );
        const prod = productResult.rows[0];

        if (!prod) throw new Error(`Product not found: ${item.product_id}`);

        if (delta > 0 && Number(prod.stock) < delta) {
          const err = new Error("Not enough stock");
          err.status = 409;
          throw err;
        }

        // stock = stock - delta
        await client.query(
          `UPDATE products SET stock = stock - $1, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = $2 AND id = $3`,
          [delta, tenantId, item.product_id]
        );
      }

      const subtotal = Number((Number(newQty) * Number(item.unit_price)).toFixed(2));

      await client.query(
        `UPDATE sale_items SET quantity = $1, subtotal = $2
         WHERE tenant_id = $3 AND id = $4 AND sale_id = $5`,
        [newQty, subtotal, tenantId, itemId, saleId]
      );

      const total = await recomputeSaleTotal(client, tenantId, saleId);

      const updatedItemResult = await client.query(
        "SELECT * FROM sale_items WHERE tenant_id = $1 AND id = $2 AND sale_id = $3 LIMIT 1",
        [tenantId, itemId, saleId]
      );
      const updatedItem = updatedItemResult.rows[0];

      return { updatedItem, total };
    });

    const { updatedItem, total } = result;
    return res.json({ item: updatedItem, total });
  } catch (e) {
    const status = e.status || 400;
    return res.status(status).json({ message: e.message || "Update failed" });
  }
}

/**
 * DELETE /api/sales/:saleId/items/:itemId
 */
export async function deleteSaleItem(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const saleId = Number(req.params.saleId);
  const itemId = Number(req.params.itemId);

  if (!Number.isFinite(saleId) || !Number.isFinite(itemId)) {
    return res.status(400).json({ message: "Invalid saleId/itemId" });
  }

  try {
    const result = await withTransaction(async (client) => {
      const saleResult = await client.query(
        "SELECT id FROM sales WHERE tenant_id = $1 AND id = $2 LIMIT 1 FOR UPDATE",
        [tenantId, saleId]
      );
      if (!saleResult.rows[0]) {
        const err = new Error("Sale not found");
        err.status = 404;
        throw err;
      }
      const itemResult = await client.query(
          `
          SELECT id, sale_id, product_id, quantity
          FROM sale_items
          WHERE tenant_id = $1 AND id = $2 AND sale_id = $3
          LIMIT 1 FOR UPDATE
          `,
          [tenantId, itemId, saleId]
      );
      const item = itemResult.rows[0];

      if (!item) {
        const err = new Error("Sale item not found");
        err.status = 404;
        throw err;
      }

      // borrar item
      await client.query(
        "DELETE FROM sale_items WHERE tenant_id = $1 AND id = $2 AND sale_id = $3",
        [tenantId, itemId, saleId]
      );

      // devolver stock
      await client.query(
        `UPDATE products SET stock = stock + $1, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $2 AND id = $3`,
        [Number(item.quantity), tenantId, item.product_id]
      );

      const total = await recomputeSaleTotal(client, tenantId, saleId);
      return { total };
    });

    const { total } = result;
    return res.json({ ok: true, total });
  } catch (e) {
    const status = e.status || 400;
    return res.status(status).json({ message: e.message || "Delete failed" });
  }
}