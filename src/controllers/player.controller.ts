import { Request, Response } from "express";
import Player from "../models/Player.model";

/* ===========================
   GET PLAYER CONFIG
=========================== */
export const getPlayer = async (_req: Request, res: Response) => {
  try {
    let config = await Player.findOne();

    if (!config) {
      config = await Player.create({});
    }

    res.json(config);
  } catch {
    res.status(500).json({ message: "Load failed" });
  }
};

/* ===========================
   SAVE PLAYER CONFIG
=========================== */
export const savePlayer = async (req: Request, res: Response) => {
  try {
    let config = await Player.findOne();

    if (!config) {
      config = await Player.create(req.body);
    } else {
      Object.assign(config, req.body);
      await config.save();
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ message: "Save failed" });
  }
};
