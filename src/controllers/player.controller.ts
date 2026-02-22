import { Request, Response } from "express";
import Player from "../models/player.model";

/* =========================
   GET PLAYER CONFIG
========================= */
export const getPlayer = async (_req: Request, res: Response) => {
  let config = await Player.findOne();

  if (!config) {
    config = await Player.create({});
  }

  res.json(config);
};

/* =========================
   SAVE PLAYER CONFIG
========================= */
export const savePlayer = async (req: Request, res: Response) => {
  let config = await Player.findOne();

  if (!config) {
    config = await Player.create(req.body);
  } else {
    Object.assign(config, req.body);
    await config.save();
  }

  res.json({ message: "Player settings updated" });
};
