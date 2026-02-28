import { Request, Response } from "express";
import Security from "../models/Security.model";

/* ===========================
   GET CONFIG
=========================== */
export const getSecurity = async (_req: Request, res: Response) => {
  try {
    let config = await Security.findOne();

    if (!config) {
      config = await Security.create({});
    }

    res.json(config);
  } catch {
    res.status(500).json({ message: "Failed to load security config" });
  }
};

/* ===========================
   SAVE CONFIG
=========================== */
export const saveSecurity = async (req: Request, res: Response) => {
  try {
    let config = await Security.findOne();

    if (!config) {
      config = await Security.create(req.body);
    } else {
      Object.assign(config, req.body);
      await config.save();
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ message: "Save failed" });
  }
};

/* ===========================
   ULTRA MODE
=========================== */
export const toggleUltra = async (req: Request, res: Response) => {
  try {
    const { enable } = req.body;

    let config = await Security.findOne();

    if (!config) {
      config = await Security.create({ ultra: enable });
    } else {
      config.ultra = enable;
      await config.save();
    }

    res.json({ success: true, ultra: enable });
  } catch {
    res.status(500).json({ message: "Ultra toggle failed" });
  }
};
