import { Request, Response } from "express";
import Ad from "../models/ad.model";

// Create Ad
export const createAd = async (req: Request, res: Response) => {
  try {
    const ad = await Ad.create(req.body);
    res.status(201).json(ad);
  } catch (err) {
    res.status(400).json({ message: "Ad creation failed", error: err });
  }
};

// Bulk Add
export const bulkCreateAds = async (req: Request, res: Response) => {
  try {
    const ads = req.body;

    if (!Array.isArray(ads) || ads.length > 1000) {
      return res.status(400).json({ message: "Invalid bulk data" });
    }

    const created = await Ad.insertMany(ads);
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ message: "Bulk insert failed", error: err });
  }
};

// Get All Ads
export const getAds = async (_req: Request, res: Response) => {
  const ads = await Ad.find().sort({ priority: 1 });
  res.json(ads);
};

// Toggle ON/OFF
export const toggleAd = async (req: Request, res: Response) => {
  const ad = await Ad.findById(req.params.id);
  if (!ad) return res.status(404).json({ message: "Ad not found" });

  ad.status = ad.status === "ON" ? "OFF" : "ON";
  await ad.save();

  res.json(ad);
};
