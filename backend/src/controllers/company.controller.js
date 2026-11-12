import { query } from "../db/postgres.js";

export async function getCompany(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const { rows } = await query(
    "SELECT name, rut, phone, address, updated_at FROM company_settings WHERE tenant_id = $1 LIMIT 1",
    [tenantId]
  );
  const row = rows[0];

  if (!row) return res.json(null);
  return res.json(row);
}

export async function upsertCompany(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const { name, rut, phone, address } = req.body || {};

  if (!name || !rut || !phone || !address) {
    return res.status(400).json({ message: "name, rut, phone y address son requeridos" });
  }

  await query(
    `
    INSERT INTO company_settings (tenant_id, name, rut, phone, address, updated_at)
    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    ON CONFLICT(tenant_id) DO UPDATE SET
      name=excluded.name,
      rut=excluded.rut,
      phone=excluded.phone,
      address=excluded.address,
      updated_at=CURRENT_TIMESTAMP
    `,
    [tenantId, name, rut, phone, address]
  );

  return res.json({ ok: true });
}