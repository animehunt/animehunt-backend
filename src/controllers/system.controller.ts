import { Request, Response } from "express";
import System from "../models/System.model";

/* ===================================
   GET SYSTEM CONFIG
=================================== */
export const getSystemConfig = async (_req: Request, res: Response) => {
  try {
    let doc = await System.findOne();

    if (!doc) {
      doc = await System.create({});
    }

    res.json({
      ...doc.config,
      killed: doc.killed
    });
  } catch {
    res.status(500).json({ message: "Failed to load system config" });
  }
};

/* ===================================
   SAVE SYSTEM CONFIG
=================================== */
export const saveSystemConfig = async (req: Request, res: Response) => {
  try {
    let doc = await System.findOne();

    if (!doc) {
      doc = await System.create({});
    }

    doc.config = {
      ...doc.config,
      ...req.body
    };

    await doc.save();

    res.json({ success: true });
  } catch {
    res.status(500).json({ message: "Save failed" });
  }
};

/* ===================================
   KILL SWITCH
=================================== */
export const killSystem = async (_req: Request, res: Response) => {
  try {
    let doc = await System.findOne();

    if (!doc) {
      doc = await System.create({});
    }

    doc.killed = true;
    await doc.save();

    res.json({ success: true });
  } catch {
    res.status(500).json({ message: "Kill failed" });
  }
};
