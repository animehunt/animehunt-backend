import { Router } from "express";
import {
  createCategory,
  getCategories,
  getSingleCategory,
  updateCategory,
  toggleCategory,
  deleteCategory
} from "../controllers/category.controller";

const router = Router();

router.get("/", getCategories);
router.get("/:id", getSingleCategory);
router.post("/", createCategory);
router.patch("/:id", updateCategory);
router.patch("/:id/toggle", toggleCategory);
router.delete("/:id", deleteCategory);

export default router;
