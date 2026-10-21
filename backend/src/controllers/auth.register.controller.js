import bcrypt from "bcryptjs";
import { withTransaction } from "../db/postgres.js";

export async function registerAdmin(req, res) {
  const { email, password, name } = req.body || {};
  if (!email || !password || !name) {
    return res.status(400).json({ message: "name, email and password required" });
  }

  const password_hash = await bcrypt.hash(password, 10);

  try {
    const out = await withTransaction(async (client) => {
      // 1) create tenant
      const tenantResult = await client.query(
        "INSERT INTO tenants DEFAULT VALUES RETURNING id"
      );
      const tenantId = Number(tenantResult.rows[0].id);

      // 2) create admin for that tenant
      const adminResult = await client.query(
        "INSERT INTO admins (tenant_id, email, password_hash, name) VALUES ($1, $2, $3, $4) RETURNING id",
        [tenantId, email, password_hash, name]
      );

      return { tenantId, adminId: Number(adminResult.rows[0].id) };
    });
    return res.status(201).json({ ok: true, tenantId: out.tenantId, adminId: out.adminId });
  } catch (e) {
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Email already exists" });
    }
    return res.status(500).json({ message: "Error creating admin" });
  }
}