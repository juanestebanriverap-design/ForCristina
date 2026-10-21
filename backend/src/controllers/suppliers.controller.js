import { z } from "zod";
import { query, withTransaction } from "../db/postgres.js";

const SupplierSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  notes: z.string().nullable().optional(),
  products: z.array(z.object({
    product_id: z.number().int().positive(),
    purchase_price: z.number().positive(),
  })),
});

const OrderSchema = z.object({
  items: z.array(z.object({
    product_id: z.number().int().positive(),
    quantity: z.number().int().positive(),
  })).min(1),
});

async function validateSupplierProducts(client, tenantId, products) {
  const seen = new Set();
  for (const item of products) {
    if (seen.has(item.product_id)) return "No repitas productos en el proveedor.";
    const result = await client.query(
      `SELECT id FROM products
       WHERE tenant_id = $1 AND id = $2 AND active = 1 LIMIT 1`,
      [tenantId, item.product_id]
    );
    if (!result.rows[0]) return "Uno de los productos no existe.";
    seen.add(item.product_id);
  }
  return null;
}

async function replaceSupplierProducts(client, tenantId, supplierId, products) {
  await client.query(
    "DELETE FROM supplier_products WHERE tenant_id = $1 AND supplier_id = $2",
    [tenantId, supplierId]
  );
  for (const item of products) {
    await client.query(
      `INSERT INTO supplier_products (tenant_id, supplier_id, product_id, purchase_price)
       VALUES ($1, $2, $3, $4)`,
      [tenantId, supplierId, item.product_id, item.purchase_price]
    );
  }
}

export async function listSuppliers(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const { rows: suppliers } = await query(
    "SELECT * FROM suppliers WHERE tenant_id = $1 ORDER BY name",
    [tenantId]
  );
  const { rows: productRows } = await query(
    `SELECT sp.supplier_id, sp.product_id, sp.purchase_price, p.name AS product_name
     FROM supplier_products sp
     JOIN products p ON p.id = sp.product_id AND p.tenant_id = sp.tenant_id
     WHERE sp.tenant_id = $1
     ORDER BY p.name`,
    [tenantId]
  );
  const productsBySupplier = new Map();
  for (const row of productRows) {
    const items = productsBySupplier.get(row.supplier_id) || [];
    items.push({
      product_id: row.product_id,
      product_name: row.product_name,
      purchase_price: Number(row.purchase_price),
    });
    productsBySupplier.set(row.supplier_id, items);
  }
  return res.json(suppliers.map((supplier) => ({
    ...supplier,
    products: productsBySupplier.get(supplier.id) || [],
  })));
}

export async function createSupplier(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const parsed = SupplierSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  try {
    const supplier = await withTransaction(async (client) => {
      const productError = await validateSupplierProducts(client, tenantId, parsed.data.products);
      if (productError) {
        const error = new Error(productError);
        error.status = 400;
        throw error;
      }
      const result = await client.query(
        `INSERT INTO suppliers (tenant_id, name, phone, notes)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [tenantId, parsed.data.name, parsed.data.phone, parsed.data.notes ?? null]
      );
      const id = Number(result.rows[0].id);
      await replaceSupplierProducts(client, tenantId, id, parsed.data.products);
      return id;
    });
    return res.status(201).json({ id: supplier, ...parsed.data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error("Failed to create supplier:", error);
    return res.status(500).json({ message: "No se pudo crear el proveedor." });
  }
}

export async function updateSupplier(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const supplierId = Number(req.params.id);
  if (!Number.isInteger(supplierId) || supplierId < 1) {
    return res.status(400).json({ message: "Proveedor inválido." });
  }
  const parsed = SupplierSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);

  try {
    await withTransaction(async (client) => {
      const existing = await client.query(
        "SELECT id FROM suppliers WHERE tenant_id = $1 AND id = $2 FOR UPDATE",
        [tenantId, supplierId]
      );
      if (!existing.rows[0]) {
        const error = new Error("Proveedor no encontrado.");
        error.status = 404;
        throw error;
      }
      const productError = await validateSupplierProducts(client, tenantId, parsed.data.products);
      if (productError) {
        const error = new Error(productError);
        error.status = 400;
        throw error;
      }
      await client.query(
        `UPDATE suppliers
         SET name = $1, phone = $2, notes = $3, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $4 AND id = $5`,
        [parsed.data.name, parsed.data.phone, parsed.data.notes ?? null, tenantId, supplierId]
      );
      await replaceSupplierProducts(client, tenantId, supplierId, parsed.data.products);
    });
    return res.json({ id: supplierId, ...parsed.data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error("Failed to update supplier:", error);
    return res.status(500).json({ message: "No se pudo actualizar el proveedor." });
  }
}

export async function deleteSupplier(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const supplierId = Number(req.params.id);
  const result = await query(
    "DELETE FROM suppliers WHERE tenant_id = $1 AND id = $2",
    [tenantId, supplierId]
  );
  if (!result.rowCount) return res.status(404).json({ message: "Proveedor no encontrado." });
  return res.status(204).send();
}

export async function listPurchaseOrders(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const { rows } = await query(
    `SELECT po.*, s.phone AS supplier_phone,
            poi.id AS item_id, poi.product_id, poi.product_name,
            poi.quantity, poi.unit_price
     FROM purchase_orders po
     LEFT JOIN suppliers s ON s.id = po.supplier_id AND s.tenant_id = po.tenant_id
     LEFT JOIN purchase_order_items poi
       ON poi.order_id = po.id AND poi.tenant_id = po.tenant_id
     WHERE po.tenant_id = $1
     ORDER BY po.created_at DESC, po.id DESC, poi.id ASC`,
    [tenantId]
  );
  const orders = new Map();
  for (const row of rows) {
    let order = orders.get(row.id);
    if (!order) {
      order = {
        id: row.id,
        tenant_id: row.tenant_id,
        supplier_id: row.supplier_id,
        supplier_name: row.supplier_name,
        supplier_phone: row.supplier_phone,
        status: row.status,
        created_at: row.created_at,
        received_at: row.received_at,
        items: [],
      };
      orders.set(row.id, order);
    }
    if (row.item_id !== null) {
      order.items.push({
        id: row.item_id,
        product_id: row.product_id,
        product_name: row.product_name,
        quantity: row.quantity,
        unit_price: Number(row.unit_price),
      });
    }
  }
  return res.json([...orders.values()]);
}

export async function createPurchaseOrder(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const supplierId = Number(req.params.id);
  const parsed = OrderSchema.safeParse(req.body);
  if (!Number.isInteger(supplierId) || supplierId < 1) {
    return res.status(400).json({ message: "Proveedor inválido." });
  }
  if (!parsed.success) return res.status(400).json(parsed.error);

  try {
    const order = await withTransaction(async (client) => {
      const supplierResult = await client.query(
        "SELECT id, name, phone FROM suppliers WHERE tenant_id = $1 AND id = $2 FOR SHARE",
        [tenantId, supplierId]
      );
      const supplier = supplierResult.rows[0];
      if (!supplier) {
        const error = new Error("Proveedor no encontrado.");
        error.status = 404;
        throw error;
      }
      const orderItems = [];
      for (const item of parsed.data.items) {
        const catalogResult = await client.query(
          `SELECT sp.purchase_price, p.name AS product_name
           FROM supplier_products sp
           JOIN products p ON p.id = sp.product_id AND p.tenant_id = sp.tenant_id
           WHERE sp.tenant_id = $1 AND sp.supplier_id = $2 AND sp.product_id = $3
           LIMIT 1`,
          [tenantId, supplierId, item.product_id]
        );
        const catalog = catalogResult.rows[0];
        if (!catalog) {
          const error = new Error("El proveedor no vende uno de los productos seleccionados.");
          error.status = 400;
          throw error;
        }
        orderItems.push({ ...item, ...catalog });
      }
      const orderResult = await client.query(
        `INSERT INTO purchase_orders (tenant_id, supplier_id, supplier_name)
         VALUES ($1, $2, $3) RETURNING id`,
        [tenantId, supplierId, supplier.name]
      );
      const orderId = Number(orderResult.rows[0].id);
      for (const item of orderItems) {
        await client.query(
          `INSERT INTO purchase_order_items
           (tenant_id, order_id, product_id, product_name, quantity, unit_price)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [tenantId, orderId, item.product_id, item.product_name, item.quantity, item.purchase_price]
        );
      }
      return { id: orderId, supplier, items: orderItems };
    });
    return res.status(201).json(order);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error("Failed to create purchase order:", error);
    return res.status(500).json({ message: "No se pudo crear el pedido." });
  }
}

export async function receivePurchaseOrder(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return res.status(400).json({ message: "Pedido inválido." });
  }
  try {
    await withTransaction(async (client) => {
      const orderResult = await client.query(
        `SELECT id, status FROM purchase_orders
         WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, orderId]
      );
      const order = orderResult.rows[0];
      if (!order) {
        const error = new Error("Pedido no encontrado.");
        error.status = 404;
        throw error;
      }
      if (order.status !== "pending") {
        const error = new Error("Este pedido ya fue recibido.");
        error.status = 409;
        throw error;
      }
      const { rows: items } = await client.query(
        `SELECT product_id, quantity, unit_price FROM purchase_order_items
         WHERE tenant_id = $1 AND order_id = $2`,
        [tenantId, orderId]
      );
      for (const item of items) {
        if (item.product_id !== null) {
          await client.query(
            `UPDATE products
             SET stock = stock + $1, purchase_price = $2, updated_at = CURRENT_TIMESTAMP
             WHERE tenant_id = $3 AND id = $4`,
            [item.quantity, item.unit_price, tenantId, item.product_id]
          );
        }
      }
      await client.query(
        `UPDATE purchase_orders SET status = 'received', received_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, orderId]
      );
    });
    return res.json({ id: orderId, status: "received" });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error("Failed to receive purchase order:", error);
    return res.status(500).json({ message: "No se pudo registrar la recepción." });
  }
}
