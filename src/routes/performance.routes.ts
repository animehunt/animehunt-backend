import express from "express";
import {
  getPerformance,
  savePerformance
} from "../controllers/performance.controller";

const router = express.Router();

router.get("/admin/performance", getPerformance);
router.post("/admin/performance", savePerformance);

export default router;
