import { Router } from "express";
import {
  getDeployData,
  deploySite,
  freezeSite,
  unfreezeSite,
  createVersion,
  createBackup,
  restoreBackup,
  emergencyShutdown,
  emergencyRecover
} from "../controllers/deploy.controller";

const router = Router();

router.get("/", getDeployData);

router.post("/deploy", deploySite);
router.patch("/freeze", freezeSite);
router.patch("/unfreeze", unfreezeSite);

router.post("/version", createVersion);
router.post("/backup", createBackup);
router.post("/restore/:id", restoreBackup);

router.post("/emergency/shutdown", emergencyShutdown);
router.post("/emergency/recover", emergencyRecover);

export default router;
