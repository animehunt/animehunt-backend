import { Router } from "express";
import { getSecurityStats } from "../controllers/securityStats.controller";

const router = Router();

router.get("/stats", getSecurityStats);

export default router;
