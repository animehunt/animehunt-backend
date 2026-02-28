import { Request, Response } from "express";
import Search from "../models/Search.model";

/* ===========================
   GET CONFIG
=========================== */
export const getSearchConfig = async (_req: Request, res: Response) => {
  try {
    let config = await Search.findOne();

    if (!config) {
      config = await Search.create({});
    }

    res.json(config);
  } catch {
    res.status(500).json({ message: "Failed to load search config" });
  }
};

/* ===========================
   SAVE CONFIG
=========================== */
export const saveSearchConfig = async (req: Request, res: Response) => {
  try {
    let config = await Search.findOne();

    if (!config) {
      config = await Search.create(req.body);
    } else {
      Object.assign(config, req.body);
      await config.save();
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ message: "Failed to save search config" });
  }
};
