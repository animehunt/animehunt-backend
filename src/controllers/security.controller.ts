import { Request, Response } from "express";
import Security from "../models/security.model";

/* =========================
   GET SECURITY CONFIG
========================= */
export const getSecurity = async (_req: Request, res: Response) => {
  let config = await Security.findOne();

  if (!config) {
    config = await Security.create({});
  }

  res.json(config);
};

/* =========================
   SAVE SECURITY CONFIG
========================= */
export const saveSecurity = async (req: Request, res: Response) => {
  let config = await Security.findOne();

  if (!config) {
    config = await Security.create(req.body);
  } else {
    Object.assign(config, req.body);
    await config.save();
  }

  res.json({ message: "Security updated" });
};

/* =========================
   ULTRA MODE TOGGLE
========================= */
export const toggleUltra = async (req: Request, res: Response) => {
  let config = await Security.findOne();
  if (!config) config = await Security.create({});

  config.ultra = req.body.enable;
  await config.save();

  res.json({ message: "Ultra mode updated" });
};

/* =========================
   LIVE SECURITY STATS
========================= */
export const securityStats = async (_req: Request, res: Response) => {
  // Dummy dynamic values (later real metrics hook kar sakte ho)
  res.json({
    blockedIPs: Math.floor(Math.random() * 50),
    liveUsers: Math.floor(Math.random() * 500),
    reqPerSec: Math.floor(Math.random() * 100)
  });
};
