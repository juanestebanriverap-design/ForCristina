import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { dailyReport, monthlyReport } from "../controllers/reports.controller.js";
import { reportByAddress } from "../controllers/reports.byAddress.controller.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = Router();
router.use(requireAuth);

router.get("/daily", asyncHandler(dailyReport));     // ?date=YYYY-MM-DD
router.get("/monthly", asyncHandler(monthlyReport)); // ?year=2026&month=4
router.get("/by-address", asyncHandler(reportByAddress));

export default router;