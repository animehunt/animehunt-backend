import express from "express";
import {
  getSystem,
  deploySite,
  freezeSite,
  unfreezeSite,
  createVersion,
  createBackup,
  restoreBackup,
  emergencyShutdown,
  emergencyRecover
} from "../controllers/system.controller";

const router = express.Router();

router.get("/admin/system", getSystem);
router.post("/admin/deploy", deploySite);
router.post("/admin/freeze", freezeSite);
router.post("/admin/unfreeze", unfreezeSite);
router.post("/admin/version", createVersion);
router.post("/admin/backup", createBackup);
router.post("/admin/restore/:id", restoreBackup);
router.post("/admin/emergency/shutdown", emergencyShutdown);
router.post("/admin/emergency/recover", emergencyRecover);

export default router;
