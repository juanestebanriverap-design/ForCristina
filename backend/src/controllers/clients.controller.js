import { z } from "zod";
import { query } from "../db/postgres.js";

const ClientCreate = z.object({
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
const ClientUpdate = ClientCreate.partial();

export async function listClients(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const { rows } = await query(
    "SELECT * FROM clients WHERE tenant_id = $1 ORDER BY id DESC",
    [tenantId]
  );
  res.json(rows);
}

export async function getClient(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const id = Number(req.params.id);

  const { rows } = await query(
    "SELECT * FROM clients WHERE tenant_id = $1 AND id = $2 LIMIT 1",
    [tenantId, id]
  );
  const row = rows[0];

  if (!row) return res.status(404).json({ message: "Not found" });
  res.json(row);
}

export async function createClient(req, res) {
  const tenantId = Number(req.user?.tenantId);

  const parsed = ClientCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);

  const c = parsed.data;

  const { rows } = await query(
    `INSERT INTO clients (tenant_id, name, phone, address, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [tenantId, c.name, c.phone ?? null, c.address ?? null, c.notes ?? null]
  );

  res.status(201).json({ id: Number(rows[0].id), ...c });
}

export async function updateClient(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const id = Number(req.params.id);

  const parsed = ClientUpdate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);

  const c = parsed.data;

  const existingResult = await query(
    "SELECT id FROM clients WHERE tenant_id = $1 AND id = $2 LIMIT 1",
    [tenantId, id]
  );
  const existing = existingResult.rows[0];

  if (!existing) return res.status(404).json({ message: "Not found" });

  await query(
    `UPDATE clients SET
      name = COALESCE($1, name),
      phone = COALESCE($2, phone),
      address = COALESCE($3, address),
      notes = COALESCE($4, notes),
      updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = $5 AND id = $6`,
    [c.name ?? null, c.phone ?? null, c.address ?? null, c.notes ?? null, tenantId, id]
  );

  const { rows } = await query(
    "SELECT * FROM clients WHERE tenant_id = $1 AND id = $2 LIMIT 1",
    [tenantId, id]
  );

  res.json(rows[0]);
}

export async function deleteClient(req, res) {
  const tenantId = Number(req.user?.tenantId);
  const id = Number(req.params.id);

  const info = await query(
    "DELETE FROM clients WHERE tenant_id = $1 AND id = $2",
    [tenantId, id]
  );

  if (info.rowCount === 0) return res.status(404).json({ message: "Not found" });
  res.status(204).send();
}