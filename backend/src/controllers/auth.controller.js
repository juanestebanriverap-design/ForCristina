import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { query } from "../db/postgres.js";

export async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: "email and password required" });
  }

  const result = await query(
    "SELECT id, tenant_id, email, password_hash, name FROM admins WHERE email = $1 LIMIT 1",
    [email]
  );
  const admin = result.rows[0];

  if (!admin) return res.status(401).json({ message: "Invalid credentials" });

  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const secret = process.env.JWT_SECRET || "dev_secret_change_me";

  const token = jwt.sign(
    {
      adminId: admin.id,
      tenantId: admin.tenant_id,
      email: admin.email,
      name: admin.name,
    },
    secret,
    { expiresIn: "7d" }
  );

  res.json({
    token,
    admin: { id: admin.id, tenantId: admin.tenant_id, email: admin.email, name: admin.name },
  });
}