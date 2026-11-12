export async function addInventoryLot(client, tenantId, productId, quantity, unitCost) {
  if (quantity <= 0) return;
  await client.query(
    `INSERT INTO inventory_lots
     (tenant_id, product_id, quantity_received, quantity_remaining, unit_cost)
     VALUES ($1, $2, $3, $3, $4)`,
    [tenantId, productId, quantity, unitCost]
  );
}

export async function receiveInventory(client, tenantId, productId, quantity, unitCost) {
  await addInventoryLot(client, tenantId, productId, quantity, unitCost);
  await client.query(
    `UPDATE products SET stock = stock + $1, purchase_price = $2, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = $3 AND id = $4`,
    [quantity, unitCost, tenantId, productId]
  );
}

export async function consumeInventory(client, tenantId, productId, quantity) {
  const { rows: lots } = await client.query(
    `SELECT id, quantity_remaining, unit_cost FROM inventory_lots
     WHERE tenant_id = $1 AND product_id = $2 AND quantity_remaining > 0
     ORDER BY id ASC FOR UPDATE`,
    [tenantId, productId]
  );
  const available = lots.reduce((total, lot) => total + Number(lot.quantity_remaining), 0);
  if (available < quantity) {
    throw new Error(`No hay stock suficiente para el producto ${productId}`);
  }

  let remaining = quantity;
  let totalCost = 0;
  const allocations = [];
  for (const lot of lots) {
    if (remaining === 0) break;
    const allocated = Math.min(remaining, Number(lot.quantity_remaining));
    const unitCost = Number(lot.unit_cost);
    await client.query(
      `UPDATE inventory_lots SET quantity_remaining = quantity_remaining - $1
       WHERE tenant_id = $2 AND id = $3`,
      [allocated, tenantId, lot.id]
    );
    allocations.push({ lotId: lot.id, quantity: allocated, unitCost });
    totalCost += allocated * unitCost;
    remaining -= allocated;
  }

  await client.query(
    `UPDATE products SET stock = stock - $1, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = $2 AND id = $3`,
    [quantity, tenantId, productId]
  );

  return {
    allocations,
    totalCost: Number(totalCost.toFixed(2)),
    unitCost: Number((totalCost / quantity).toFixed(2)),
  };
}

export async function restoreSaleItemInventory(client, tenantId, item) {
  const { rows: allocations } = await client.query(
    `SELECT lot_id, quantity FROM sale_item_lots
     WHERE tenant_id = $1 AND sale_item_id = $2`,
    [tenantId, item.id]
  );

  let restored = 0;
  if (allocations.length) {
    for (const allocation of allocations) {
      await client.query(
        `UPDATE inventory_lots SET quantity_remaining = quantity_remaining + $1
         WHERE tenant_id = $2 AND id = $3`,
        [allocation.quantity, tenantId, allocation.lot_id]
      );
      restored += Number(allocation.quantity);
    }
  } else {
    restored = Number(item.quantity);
    await addInventoryLot(
      client,
      tenantId,
      item.product_id,
      restored,
      Number(item.unit_cost)
    );
  }

  await client.query(
    `UPDATE products SET stock = stock + $1, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = $2 AND id = $3`,
    [restored, tenantId, item.product_id]
  );
}

export async function recordSaleItemAllocations(client, tenantId, saleItemId, allocations) {
  for (const allocation of allocations) {
    await client.query(
      `INSERT INTO sale_item_lots (tenant_id, sale_item_id, lot_id, quantity, unit_cost)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, saleItemId, allocation.lotId, allocation.quantity, allocation.unitCost]
    );
  }
}

export async function adjustInventory(client, tenantId, productId, currentStock, targetStock, unitCost) {
  if (targetStock > currentStock) {
    const added = targetStock - currentStock;
    await addInventoryLot(client, tenantId, productId, added, unitCost);
  } else if (targetStock < currentStock) {
    const removed = currentStock - targetStock;
    const { rows: lots } = await client.query(
      `SELECT id, quantity_remaining FROM inventory_lots
       WHERE tenant_id = $1 AND product_id = $2 AND quantity_remaining > 0
       ORDER BY id ASC FOR UPDATE`,
      [tenantId, productId]
    );
    const available = lots.reduce((total, lot) => total + Number(lot.quantity_remaining), 0);
    if (available < removed) {
      const error = new Error(`El inventario FIFO del producto ${productId} no coincide con su stock.`);
      error.status = 409;
      throw error;
    }
    let remaining = removed;
    for (const lot of lots) {
      if (remaining === 0) break;
      const taken = Math.min(remaining, Number(lot.quantity_remaining));
      await client.query(
        `UPDATE inventory_lots SET quantity_remaining = quantity_remaining - $1
         WHERE tenant_id = $2 AND id = $3`,
        [taken, tenantId, lot.id]
      );
      remaining -= taken;
    }
  }
}
