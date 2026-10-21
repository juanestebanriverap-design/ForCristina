import { query } from "../db/postgres.js";

export async function reportByAddress(req, res) {
  const tenantId = Number(req.user?.tenantId);
  if (!tenantId) return res.status(401).json({ message: "No autorizado" });

  const year = Number(req.query.year);
  const month = Number(req.query.month);

  if (!year || !month || month < 1 || month > 12) {
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
        GROUP BY address, product_id, product_name
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

  // B) Ganancia neta y % neto por producto en el mes
  const profitResult = await query(
      `
      SELECT
        p.id,
        p.name,
        SUM(si.quantity) AS qty,
        SUM(si.quantity * si.unit_price) AS revenue,
        SUM(si.quantity * si.unit_cost) AS cost,
        SUM(si.quantity * (si.unit_price - si.unit_cost)) AS net_profit
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id AND si.tenant_id = s.tenant_id
      JOIN products p ON p.id = si.product_id AND p.tenant_id = si.tenant_id
      WHERE s.tenant_id = $1
        AND s.sale_date >= $2::date AND s.sale_date < $3::date
      GROUP BY p.id, p.name
      ORDER BY net_profit DESC
      `,
      [tenantId, start, end]
  );
  const profitRows = profitResult.rows;

  const profitByProduct = profitRows.map((r) => {
    const revenue = Number(r.revenue || 0);
    const net = Number(r.net_profit || 0);
    const pct = revenue > 0 ? (net / revenue) * 100 : 0;

    return {
      id: r.id,
      name: r.name,
      qty: Number(r.qty || 0),
      revenue,
      cost: Number(r.cost || 0),
      net_profit: net,
      net_profit_pct: Number(pct.toFixed(2)),
    };
  });

  res.json({
    year,
    month,
    byAddress: byAddressRows,
    profitByProduct,
  });
}