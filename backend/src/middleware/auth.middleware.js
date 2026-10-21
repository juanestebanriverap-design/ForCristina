import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const [, token] = auth.split(" ");

    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const secret = process.env.JWT_SECRET || "dev_secret_change_me";
    const payload = jwt.verify(token, secret);

    if (!payload?.adminId || !payload?.tenantId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    req.user = payload; // {adminId, tenantId, ...}
    return next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
}