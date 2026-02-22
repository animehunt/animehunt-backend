import express from "express";
import {
  getDownloads,
  createDownload,
  deleteDownload
} from "../controllers/download.controller";

const router = express.Router();

router.get("/admin/download", getDownloads);
router.post("/admin/download", createDownload);
router.delete("/admin/download", deleteDownload);

export default router;
