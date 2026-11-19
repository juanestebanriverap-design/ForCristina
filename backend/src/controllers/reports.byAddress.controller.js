import { query } from "../db/postgres.js";

export async function reportByAddress(req, res) {
  const tenantId = Number(req.user?.tenantId);
  if (!tenantId) return res.status(401).json({ message: "No autorizado" });

  const year = Number(req.query.year);
  const month = Number(req.query.month);

  if (!Number.isInteger(year) || year < 1 || year > 9998
    || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ message: "year y month son requeridos (month 1-12)" });
  }

  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  // A) Producto más vendido por dirección (Top 1 por cantidad)
  const byAddressResult = await query(
      `
      WITH sales_in_range AS (
        SELECT s.id AS sale_id, s.client_id, s.tenant_id
        FROM sales s
        WHERE s.tenant_id = $1
          AND s.sale_date >= $2::date AND s.sale_date < $3::date
      ),
      items AS (
        SELECT
          COALESCE(NULLIF(TRIM(c.address), ''), 'MOSTRADOR / SIN DIRECCIÓN') AS address,
          p.id AS product_id,
          p.name AS product_name,
          SUM(si.quantity) AS qty,
          SUM(si.quantity * si.unit_price) AS revenue
        FROM sales_in_range r
        LEFT JOIN clients c ON c.id = r.client_id AND c.tenant_id = r.tenant_id
        JOIN sale_items si ON si.sale_id = r.sale_id AND si.tenant_id = r.tenant_id
        JOIN products p ON p.id = si.product_id AND p.tenant_id = si.tenant_id
        GROUP BY 1, p.id, p.name
      ),
      ranked AS (
        SELECT
          address, product_id, product_name, qty, revenue,
          ROW_NUMBER() OVER (PARTITION BY address ORDER BY qty DESC, revenue DESC) AS rn
        FROM items
      )
      SELECT
        address,
        product_id AS top_product_id,
        product_name AS top_product_name,
        qty AS top_qty,
        revenue AS top_revenue
      FROM ranked
      WHERE rn = 1
      ORDER BY address ASC
      `,
      [tenantId, start, end]
  );
  const byAddressRows = byAddressResult.rows;

  // B) Ganancia bruta y margen por producto en el mes
  const profitResult = await query(
      `
      SELECT
        p.id,
        p.name,
        SUM(si.quantity) AS qty,
        SUM(si.subtotal) AS revenue,
        SUM(si.total_cost) AS cost,
        SUM(si.subtotal - si.total_cost) AS gross_profit
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id AND si.tenant_id = s.tenant_id
      JOIN products p ON p.id = si.product_id AND p.tenant_id = si.tenant_id
      WHERE s.tenant_id = $1
        AND s.sale_date >= $2::date AND s.sale_date < $3::date
      GROUP BY p.id, p.name
      ORDER BY gross_profit DESC
      `,
      [tenantId, start, end]
  );
  const profitRows = profitResult.rows;

  const profitByProduct = profitRows.map((r) => {
    const revenue = Number(r.revenue || 0);
    const gross = Number(r.gross_profit || 0);
    const pct = revenue > 0 ? (gross / revenue) * 100 : 0;

    return {
      id: r.id,
      name: r.name,
      qty: Number(r.qty || 0),
      revenue,
      cost: Number(r.cost || 0),
      gross_profit: gross,
      gross_profit_pct: Number(pct.toFixed(2)),
      // Keep the old fields for clients that have not been updated yet.
      net_profit: gross,
      net_profit_pct: Number(pct.toFixed(2)),
    };
  });

  const lotProfitResult = await query(
    `
    WITH items_in_range AS (
      SELECT
        si.id,
        si.tenant_id,
        si.product_id,
        si.quantity,
        si.unit_price,
        si.subtotal,
        si.total_cost
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id AND si.tenant_id = s.tenant_id
      WHERE s.tenant_id = $1
        AND s.sale_date >= $2::date AND s.sale_date < $3::date
    ),
    allocation_totals AS (
      SELECT
        sale_item_id,
        SUM(quantity) AS quantity,
        SUM(quantity * unit_cost) AS cost
      FROM sale_item_lots
      WHERE tenant_id = $1
      GROUP BY sale_item_id
    ),
    allocated_profit AS (
      SELECT
        i.product_id,
        p.name AS product_name,
        l.id AS lot_id,
        l.created_at AS lot_received_at,
        SUM(sil.quantity) AS quantity_sold,
        SUM(sil.quantity * i.unit_price) AS revenue,
        SUM(sil.quantity * sil.unit_cost) AS cost
      FROM items_in_range i
      JOIN sale_item_lots sil
        ON sil.tenant_id = i.tenant_id AND sil.sale_item_id = i.id
      JOIN inventory_lots l
        ON l.tenant_id = sil.tenant_id
       AND l.product_id = i.product_id
       AND l.id = sil.lot_id
      JOIN products p ON p.tenant_id = i.tenant_id AND p.id = i.product_id
      GROUP BY i.product_id, p.name, l.id, l.created_at
    ),
    unallocated_profit AS (
      SELECT
        i.product_id,
        p.name AS product_name,
        CAST(NULL AS BIGINT) AS lot_id,
        CAST(NULL AS TIMESTAMPTZ) AS lot_received_at,
        SUM(i.quantity - COALESCE(a.quantity, 0)) AS quantity_sold,
        SUM((i.quantity - COALESCE(a.quantity, 0)) * i.unit_price) AS revenue,
        SUM(i.total_cost - COALESCE(a.cost, 0)) AS cost
      FROM items_in_range i
      LEFT JOIN allocation_totals a ON a.sale_item_id = i.id
      JOIN products p ON p.tenant_id = i.tenant_id AND p.id = i.product_id
      WHERE i.quantity > COALESCE(a.quantity, 0)
      GROUP BY i.product_id, p.name
    ),
    lot_profit AS (
      SELECT * FROM allocated_profit
      UNION ALL
      SELECT * FROM unallocated_profit
    ),
    lot_order AS (
      SELECT
        tenant_id,
        product_id,
        id AS lot_id,
        ROW_NUMBER() OVER (PARTITION BY tenant_id, product_id ORDER BY id) AS lot_number,
        COUNT(*) OVER (PARTITION BY tenant_id, product_id) AS lot_count
      FROM inventory_lots
      WHERE tenant_id = $1
    )
    SELECT
      lp.*,
      lo.lot_number,
      lo.lot_count
    FROM lot_profit lp
    LEFT JOIN lot_order lo
      ON lo.product_id = lp.product_id AND lo.lot_id = lp.lot_id
    ORDER BY lp.product_name ASC, CASE WHEN lp.lot_id IS NULL THEN 1 ELSE 0 END, lp.lot_id ASC
    `,
    [tenantId, start, end]
  );
  const profitByLot = lotProfitResult.rows.map((row) => {
    const revenue = Number(row.revenue || 0);
    const cost = Number(row.cost || 0);
    const quantity = Number(row.quantity_sold || 0);
    const lotNumber = Number(row.lot_number || 0);
    const lotCount = Number(row.lot_count || 0);

    let lotLabel = "Histórico sin lote FIFO";
    if (lotNumber && lotCount === 1) lotLabel = "Único lote";
    else if (lotNumber === 1) lotLabel = "Lote anterior";
    else if (lotNumber && lotNumber === lotCount) lotLabel = "Lote más reciente";
    else if (lotNumber) lotLabel = `Lote intermedio ${lotNumber}`;

    return {
      product_id: row.product_id,
      product_name: row.product_name,
      lot_id: row.lot_id,
      lot_label: lotLabel,
      lot_received_at: row.lot_received_at,
      quantity_sold: quantity,
      unit_cost: quantity > 0 && row.lot_id !== null
        ? Number((cost / quantity).toFixed(2))
        : null,
      revenue,
      cost,
      gross_profit: Number((revenue - cost).toFixed(2)),
      gross_profit_pct: revenue > 0
        ? Number((((revenue - cost) / revenue) * 100).toFixed(2))
        : 0,
    };
  });

  res.json({
    year,
    month,
    byAddress: byAddressRows,
    profitByProduct,
    profitByLot,
  });
}