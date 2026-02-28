import { Router } from "express";
import {
  getDownloads,
  bulkCreateDownloads,
  deleteDownload
} from "../controllers/download.controller";

const router = Router();

router.get("/", getDownloads);
router.post("/bulk", bulkCreateDownloads);
router.delete("/:id", deleteDownload);

export default router;
