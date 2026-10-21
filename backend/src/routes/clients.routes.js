import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../middleware/async-handler.js";
import {
  listClients, getClient, createClient, updateClient, deleteClient
} from "../controllers/clients.controller.js";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(listClients));
router.get("/:id", asyncHandler(getClient));
router.post("/", asyncHandler(createClient));
router.put("/:id", asyncHandler(updateClient));
router.delete("/:id", asyncHandler(deleteClient));

export default router;