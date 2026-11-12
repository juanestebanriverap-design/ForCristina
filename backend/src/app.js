import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";
import productsRoutes from "./routes/products.routes.js";
import clientsRoutes from "./routes/clients.routes.js";
import salesRoutes from "./routes/sales.routes.js";
import reportsRoutes from "./routes/reports.routes.js";
import companyRoutes from "./routes/company.routes.js";
import suppliersRoutes from "./routes/suppliers.routes.js";
import { asyncHandler } from "./middleware/async-handler.js";
import { query } from "./db/postgres.js";

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Permite tools como curl/postman (sin origin)
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin) || origin === "null") return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
  })
);
app.use(express.json());

app.get("/api/health", asyncHandler(async (req, res) => {
  await query("SELECT 1");
  return res.json({ ok: true });
}));

app.use("/api/auth", authRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/clients", clientsRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/company", companyRoutes);
app.use("/api/suppliers", suppliersRoutes);

app.use((error, req, res, next) => {
  console.error("Unhandled API request error:", error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ message: "Error interno del servidor." });
});

export default app;