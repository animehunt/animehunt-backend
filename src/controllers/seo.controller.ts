import { Request, Response } from "express";
import SEO from "../models/SEO.model";

/* ===========================
   GET SEO CONFIG
=========================== */
export const getSEO = async (_req: Request, res: Response) => {
  try {
    let config = await SEO.findOne();

    if (!config) {
      config = await SEO.create({});
    }

    res.json(config);
  } catch {
    res.status(500).json({ message: "Failed to load SEO config" });
  }
};

/* ===========================
   SAVE SEO CONFIG
=========================== */
export const saveSEO = async (req: Request, res: Response) => {
  try {
    let config = await SEO.findOne();

    if (!config) {
      config = await SEO.create(req.body);
    } else {
      Object.assign(config, req.body);
      await config.save();
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ message: "SEO save failed" });
  }
};
