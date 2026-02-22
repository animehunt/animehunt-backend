import express from "express";
import { getAI, updateAI, togglePause } from "../controllers/ai.controller";

const router = express.Router();

router.get("/", getAI);
router.patch("/", updateAI);
router.patch("/pause", togglePause);

export default router;
