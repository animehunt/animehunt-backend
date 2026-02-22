import { Request, Response } from "express";
import Performance from "../models/performance.model";

/* =========================
   GET PERFORMANCE CONFIG
========================= */
export const getPerformance = async (_req: Request, res: Response) => {
  let config = await Performance.findOne();

  if (!config) {
    config = await Performance.create({});
  }

  res.json(config);
};

/* =========================
   SAVE PERFORMANCE CONFIG
========================= */
export const savePerformance = async (req: Request, res: Response) => {
  let config = await Performance.findOne();

  if (!config) {
    config = await Performance.create(req.body);
  } else {
    Object.assign(config, req.body);
    await config.save();
  }

  res.json({ message: "Performance updated" });
};
