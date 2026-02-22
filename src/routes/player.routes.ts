import express from "express";
import { getPlayer, savePlayer } from "../controllers/player.controller";

const router = express.Router();

router.get("/admin/player", getPlayer);
router.post("/admin/player", savePlayer);

export default router;
