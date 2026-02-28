import { Request, Response } from "express";
import Ad from "../models/Ad.model";

/* ===========================
   CREATE SINGLE AD
=========================== */
export const createAd = async (req: Request, res: Response) => {
  try {
    const ad = await Ad.create(req.body);
    res.status(201).json(ad);
  } catch (error) {
    res.status(500).json({ message: "Failed to create ad" });
  }
};

/* ===========================
   BULK CREATE
=========================== */
export const bulkCreateAds = async (req: Request, res: Response) => {
  try {
    if (!Array.isArray(req.body))
      return res.status(400).json({ message: "Invalid data format" });

    const ads = await Ad.insertMany(req.body);
    res.status(201).json(ads);
  } catch (error) {
    res.status(500).json({ message: "Bulk insert failed" });
  }
};

/* ===========================
   GET ALL ADS
=========================== */
export const getAds = async (_req: Request, res: Response) => {
  try {
    const ads = await Ad.find().sort({ priority: 1 });
    res.json(ads);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch ads" });
  }
};

/* ===========================
   TOGGLE STATUS
=========================== */
export const toggleAdStatus = async (req: Request, res: Response) => {
  try {
    const ad = await Ad.findById(req.params.id);
    if (!ad) return res.status(404).json({ message: "Ad not found" });

    ad.status = ad.status === "ON" ? "OFF" : "ON";
    await ad.save();

    res.json({ message: "Status updated", status: ad.status });
  } catch (error) {
    res.status(500).json({ message: "Toggle failed" });
  }
};
