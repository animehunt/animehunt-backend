import express from "express";
import {
  getCategories,
  createCategory,
  updateCategory,
  toggleCategory,
  deleteCategory
} from "../controllers/category.controller";

const router = express.Router();

router.get("/admin/categories", getCategories);
router.post("/admin/categories", createCategory);
router.patch("/admin/categories/:id", updateCategory);
router.patch("/admin/categories/:id/toggle", toggleCategory);
router.delete("/admin/categories/:id", deleteCategory);

export default router;
