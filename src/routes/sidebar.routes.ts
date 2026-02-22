import express from "express";
import {
  getSidebar,
  saveSidebar,
  deleteSidebar,
  getPublicSidebar
} from "../controllers/sidebar.controller";

const router = express.Router();

/* ===== ADMIN ===== */
router.get("/admin/sidebar", getSidebar);
router.post("/admin/sidebar", saveSidebar);
router.delete("/admin/sidebar", deleteSidebar);

/* ===== PUBLIC ===== */
router.get("/sidebar", getPublicSidebar);

export default router;
