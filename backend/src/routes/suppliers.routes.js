import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../middleware/async-handler.js";
import {
  createPurchaseOrder,
  createSupplier,
  deleteSupplier,
  listPurchaseOrders,
  listSuppliers,
  receivePurchaseOrder,
  updateSupplier,
} from "../controllers/suppliers.controller.js";

const router = Router();
router.use(requireAuth);

router.get("/orders", asyncHandler(listPurchaseOrders));
router.post("/orders/:orderId/receive", asyncHandler(receivePurchaseOrder));
router.get("/", asyncHandler(listSuppliers));
router.post("/", asyncHandler(createSupplier));
router.post("/:id/orders", asyncHandler(createPurchaseOrder));
router.put("/:id", asyncHandler(updateSupplier));
router.delete("/:id", asyncHandler(deleteSupplier));

export default router;
