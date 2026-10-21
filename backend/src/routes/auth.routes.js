import { Router } from "express";
import { login } from "../controllers/auth.controller.js";
import { registerAdmin } from "../controllers/auth.register.controller.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = Router();

router.post("/login", asyncHandler(login));

// SaaS: registro público (crea tenant + admin)
router.post("/register", asyncHandler(registerAdmin));

export default router;