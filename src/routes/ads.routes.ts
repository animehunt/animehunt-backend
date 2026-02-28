import { Router } from "express";
import {
  createAd,
  bulkCreateAds,
  getAds,
  toggleAdStatus
} from "../controllers/ads.controller";

const router = Router();

router.post("/", createAd);
router.post("/bulk", bulkCreateAds);
router.get("/", getAds);
router.patch("/:id/toggle", toggleAdStatus);

export default router;
