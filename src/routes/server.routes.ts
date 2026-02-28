import { Router } from "express";
import {
  getServers,
  saveServer,
  deleteServer
} from "../controllers/server.controller";

const router = Router();

router.get("/", getServers);
router.post("/", saveServer);
router.delete("/", deleteServer);

export default router;
