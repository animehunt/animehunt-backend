import { Request, Response } from "express";
import Banner from "../models/Banner.model";

/* ===========================
   CREATE
=========================== */
export const createBanner = async (req: Request, res: Response) => {
  try {
    if (!req.body.image)
      return res.status(400).json({ message: "Image required" });

    const banner = await Banner.create(req.body);
    res.status(201).json(banner);
  } catch {
    res.status(500).json({ message: "Create failed" });
  }
};

/* ===========================
   GET ALL
=========================== */
export const getBanners = async (_req: Request, res: Response) => {
  try {
    const banners = await Banner.find().sort({ order: 1 });
    res.json(banners);
  } catch {
    res.status(500).json({ message: "Fetch failed" });
  }
};

/* ===========================
   TOGGLE STATUS
=========================== */
export const updateBannerStatus = async (req: Request, res: Response) => {
  try {
    const { active } = req.body;

    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      { active },
      { new: true }
    );

    if (!banner)
      return res.status(404).json({ message: "Banner not found" });

    res.json(banner);
  } catch {
    res.status(500).json({ message: "Update failed" });
  }
};

/* ===========================
   DELETE
=========================== */
export const deleteBanner = async (req: Request, res: Response) => {
  try {
    await Banner.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ message: "Delete failed" });
  }
};
