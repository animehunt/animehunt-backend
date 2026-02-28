import { Router } from "express";
import {
  createBanner,
  getBanners,
  updateBannerStatus,
  deleteBanner
} from "../controllers/banner.controller";

const router = Router();

router.get("/", getBanners);
router.post("/", createBanner);
router.put("/:id/status", updateBannerStatus);
router.delete("/:id", deleteBanner);

export default router;
