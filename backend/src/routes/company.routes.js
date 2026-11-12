import express from "express";
import { getCompany, upsertCompany } from "../controllers/company.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = express.Router();

router.get("/", requireAuth, asyncHandler(getCompany));
router.post("/", requireAuth, asyncHandler(upsertCompany));

export default router;