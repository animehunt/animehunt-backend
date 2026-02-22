import { Request, Response } from "express";
import Banner from "../models/banner.model";

// GET ALL
export const getBanners = async (_req: Request, res: Response) => {
  const banners = await Banner.find().sort({ order: 1 });
  res.json(banners);
};

// CREATE
export const createBanner = async (req: Request, res: Response) => {
  try {
    const banner = await Banner.create(req.body);
    res.status(201).json(banner);
  } catch {
    res.status(400).json({ message: "Banner creation failed" });
  }
};

// TOGGLE STATUS
export const toggleBannerStatus = async (req: Request, res: Response) => {
  const { active } = req.body;

  const updated = await Banner.findByIdAndUpdate(
    req.params.id,
    { active },
    { new: true }
  );

  res.json(updated);
};

// DELETE
export const deleteBanner = async (req: Request, res: Response) => {
  await Banner.findByIdAndDelete(req.params.id);
  res.json({ message: "Banner deleted" });
};
