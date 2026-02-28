import { Router } from "express";
import {
  getAISettings,
  updateAISetting,
  pauseAI
} from "../controllers/ai.controller";

const router = Router();

router.get("/", getAISettings);
router.patch("/", updateAISetting);
router.patch("/pause", pauseAI);

export default router;
