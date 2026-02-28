import { Router } from "express";
import {
  getPerformance,
  savePerformance
} from "../controllers/performance.controller";

const router = Router();

router.get("/", getPerformance);
router.post("/", savePerformance);

export default router;
