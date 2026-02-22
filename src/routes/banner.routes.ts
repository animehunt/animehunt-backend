import express from "express";
import {
  getBanners,
  createBanner,
  toggleBannerStatus,
  deleteBanner
} from "../controllers/banner.controller";

const router = express.Router();

router.get("/admin/banners", getBanners);
router.post("/admin/banners", createBanner);
router.put("/admin/banners/:id/status", toggleBannerStatus);
router.delete("/admin/banners/:id", deleteBanner);

export default router;
