import { Router } from "express";
import {
  getSystemConfig,
  saveSystemConfig,
  killSystem
} from "../controllers/system.controller";

const router = Router();

router.get("/", getSystemConfig);
router.post("/", saveSystemConfig);
router.post("/kill", killSystem);

export default router;
