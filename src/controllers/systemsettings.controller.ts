import { Request, Response } from "express";
import System from "../models/system.model";

/* =========================
   GET SYSTEM CONFIG
========================= */
export const getSystem = async (_req: Request, res: Response) => {
  let sys = await System.findOne();

  if (!sys) {
    sys = await System.create({ config: {}, killed: false });
  }

  res.json(sys.config || {});
};

/* =========================
   SAVE SYSTEM CONFIG
========================= */
export const saveSystem = async (req: Request, res: Response) => {
  let sys = await System.findOne();

  if (!sys) {
    sys = await System.create({ config: req.body });
  } else {
    sys.config = { ...sys.config, ...req.body };
    await sys.save();
  }

  res.json({ message: "System updated" });
};

/* =========================
   KILL SWITCH
========================= */
export const killSystem = async (_req: Request, res: Response) => {
  let sys = await System.findOne();

  if (!sys) {
    sys = await System.create({ config: {}, killed: true });
  } else {
    sys.killed = true;
    await sys.save();
  }

  res.json({ message: "System halted" });
};
