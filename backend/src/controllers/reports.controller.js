import { query } from "../db/postgres.js";

export async function dailyReport(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const date = req.query.date; // YYYY-MM-DD
  if (!date) {
    return res.status(400).json({ message: "date query param required (YYYY-MM-DD)" });
  }

  const totalsResult = await query(
      `
      SELECT
        COUNT(*) AS invoices,
        COALESCE(SUM(total), 0) AS total_sold
      FROM sales
      WHERE tenant_id = $1
        AND sale_date::date = $2::date
      `,
      [tenantId, date]
  );
  const totals = totalsResult.rows[0];

  const netProfitResult = await query(
      `
      SELECT COALESCE(SUM(si.quantity * (si.unit_price - si.unit_cost)), 0) AS net_profit
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id AND si.tenant_id = s.tenant_id
      JOIN products p ON p.id = si.product_id AND p.tenant_id = si.tenant_id
      WHERE s.tenant_id = $1
        AND s.sale_date::date = $2::date
      `,
      [tenantId, date]
  );
  const netProfit = netProfitResult.rows[0];

  const topProductsResult = await query(
      `
      SELECT p.id, p.name, SUM(si.quantity) AS qty
      FROM sale_items si
      JOIN sales s
        ON s.id = si.sale_id
       AND s.tenant_id = si.tenant_id
      JOIN products p
        ON p.id = si.product_id
       AND p.tenant_id = si.tenant_id
      WHERE si.tenant_id = $1
        AND s.sale_date::date = $2::date
      GROUP BY p.id, p.name
      ORDER BY qty DESC
      LIMIT 10
      `,
      [tenantId, date]
  );
  const topProducts = topProductsResult.rows;

  res.json({
    date,
    invoices: Number(totals?.invoices || 0),
    total_sold: Number(totals?.total_sold || 0),
    net_profit: Number(netProfit?.net_profit || 0),
    topProducts: topProducts.map((r) => ({
      id: r.id,
      name: r.name,
      qty: Number(r.qty || 0),
    })),
  });
}

export async function monthlyReport(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const year = Number(req.query.year);
  const month = Number(req.query.month);

  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ message: "year and month required (month 1-12)" });
  }

  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const totalsResult = await query(
      `
      SELECT
        COUNT(*) AS invoices,
        COALESCE(SUM(total), 0) AS total_sold
      FROM sales
      WHERE tenant_id = $1
        AND sale_date >= $2::date
        AND sale_date < $3::date
      `,
      [tenantId, start, end]
  );
  const totals = totalsResult.rows[0];

  const netProfitResult = await query(
      `
      SELECT COALESCE(SUM(si.quantity * (si.unit_price - si.unit_cost)), 0) AS net_profit
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id AND si.tenant_id = s.tenant_id
      JOIN products p ON p.id = si.product_id AND p.tenant_id = si.tenant_id
      WHERE s.tenant_id = $1
        AND s.sale_date >= $2::date
        AND s.sale_date < $3::date
      `,
      [tenantId, start, end]
  );
  const netProfit = netProfitResult.rows[0];

  const byDayResult = await query(
      `
      SELECT sale_date::date AS day, COALESCE(SUM(total), 0) AS total
      FROM sales
      WHERE tenant_id = $1
        AND sale_date >= $2::date
        AND sale_date < $3::date
      GROUP BY sale_date::date
      ORDER BY day ASC
      `,
      [tenantId, start, end]
  );
  const byDay = byDayResult.rows;

  res.json({
    year,
    month,
    invoices: Number(totals?.invoices || 0),
    total_sold: Number(totals?.total_sold || 0),
    net_profit: Number(netProfit?.net_profit || 0),
    byDay: byDay.map((r) => ({
      day: r.day,
      total: Number(r.total || 0),
    })),
  });
}