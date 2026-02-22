import express from "express";
import {
  getServers,
  saveServer,
  deleteServer
} from "../controllers/server.controller";

import { getEpisodeServers } from "../controllers/public.server.controller";

const router = express.Router();

/* ===== ADMIN ===== */
router.get("/admin/servers", getServers);
router.post("/admin/servers", saveServer);
router.delete("/admin/servers", deleteServer);

/* ===== PUBLIC PLAYER ===== */
router.get("/servers", getEpisodeServers);

export default router;
