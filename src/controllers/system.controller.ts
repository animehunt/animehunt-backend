import { Request, Response } from "express";
import System from "../models/system.model";

/* ===========================
   GET SYSTEM
=========================== */
export const getSystem = async (_req: Request, res: Response) => {
  const system = await System.findOne();

  if (!system) {
    const newSystem = await System.create({});
    return res.json(newSystem);
  }

  res.json(system);
};

/* ===========================
   SAVE SYSTEM CONFIG
=========================== */
export const saveSystem = async (req: Request, res: Response) => {
  let system = await System.findOne();

  if (!system) {
    system = await System.create({});
  }

  system.config = req.body;
  await system.save();

  res.json({
    success: true,
    message: "System config saved",
    data: system
  });
};

/* ===========================
   KILL SYSTEM
=========================== */
export const killSystem = async (_req: Request, res: Response) => {
  let system = await System.findOne();

  if (!system) {
    system = await System.create({});
  }

  system.killed = true;
  await system.save();

  res.json({
    success: true,
    message: "System halted"
  });
};
