import { Request, Response } from "express";
import Footer from "../models/Footer.model";

/* ===========================
   GET CONFIG
=========================== */
export const getFooter = async (_req: Request, res: Response) => {
  try {
    let config = await Footer.findOne();

    if (!config) {
      config = await Footer.create({});
    }

    res.json(config);
  } catch {
    res.status(500).json({ message: "Load failed" });
  }
};

/* ===========================
   SAVE / UPDATE
=========================== */
export const saveFooter = async (req: Request, res: Response) => {
  try {
    let config = await Footer.findOne();

    if (!config) {
      config = await Footer.create(req.body);
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
   KILL FOOTER
=========================== */
export const killFooter = async (_req: Request, res: Response) => {
  try {
    let config = await Footer.findOne();

    if (!config) {
      config = await Footer.create({});
    }

    config.footerOn = false;
    await config.save();

    res.json({ success: true });
  } catch {
    res.status(500).json({ message: "Kill failed" });
  }
};
