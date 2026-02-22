import express from "express";
import {
  getSecurity,
  saveSecurity,
  toggleUltra,
  securityStats
} from "../controllers/security.controller";

const router = express.Router();

router.get("/admin/security", getSecurity);
router.post("/admin/security", saveSecurity);
router.post("/admin/security/ultra", toggleUltra);

router.get("/security/stats", securityStats);

export default router;
