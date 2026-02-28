import { Router } from "express";
import {
  getSecurity,
  saveSecurity,
  toggleUltra
} from "../controllers/security.controller";

const router = Router();

router.get("/", getSecurity);
router.post("/", saveSecurity);
router.post("/ultra", toggleUltra);

export default router;
