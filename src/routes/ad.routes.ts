import express from "express";
import {
  createAd,
  bulkCreateAds,
  getAds,
  toggleAd
} from "../controllers/ad.controller";

const router = express.Router();

router.post("/", createAd);
router.post("/bulk", bulkCreateAds);
router.get("/", getAds);
router.patch("/:id/toggle", toggleAd);

export default router;
