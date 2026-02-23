import express from "express";
import {
  getSystem,
  saveSystem,
  killSystem
} from "../controllers/system.controller";

const router = express.Router();

router.get("/admin/system", getSystem);
router.post("/admin/system", saveSystem);
router.post("/admin/system/kill", killSystem);

export default router;
