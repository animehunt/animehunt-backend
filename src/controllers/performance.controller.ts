import { Request, Response } from "express";
import Performance from "../models/Performance.model";

/* ===========================
   GET SETTINGS
=========================== */
export const getPerformance = async (_req: Request, res: Response) => {
  try {
    let config = await Performance.findOne();

    if (!config) {
      config = await Performance.create({});
    }

    res.json(config);
  } catch {
    res.status(500).json({ message: "Load failed" });
  }
};

/* ===========================
   SAVE SETTINGS
=========================== */
export const savePerformance = async (
  req: Request,
  res: Response
) => {
  try {
    let config = await Performance.findOne();

    if (!config) {
      config = await Performance.create(req.body);
    } else {
      Object.assign(config, req.body);
      await config.save();
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ message: "Save failed" });
  }
};
