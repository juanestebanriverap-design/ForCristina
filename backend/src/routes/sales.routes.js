import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../middleware/async-handler.js";
import {
  createSale,
  updateSale,
  listSales,
  getSale,
  deleteSaleItem,
  updateSaleItemQuantity,
} from "../controllers/sales.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", asyncHandler(listSales));
router.post("/", asyncHandler(createSale));

router.put("/:id", asyncHandler(updateSale));
router.get("/:id", asyncHandler(getSale));

// editar/eliminar renglones de una venta
router.patch("/:saleId/items/:itemId", asyncHandler(updateSaleItemQuantity));
router.delete("/:saleId/items/:itemId", asyncHandler(deleteSaleItem));

export default router;