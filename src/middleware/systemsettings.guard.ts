import { Request, Response, NextFunction } from "express";
import System from "../models/system.model";

export const systemGuard = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const sys = await System.findOne();

  if (!sys) return next();

  /* 🚨 HARD KILL */
  if (sys.killed) {
    return res.status(503).json({
      message: "System temporarily halted"
    });
  }

  /* 🚧 HARD MAINTENANCE */
  if (sys.config?.maintenanceHard) {
    return res.status(503).json({
      message: "Under Maintenance"
    });
  }

  next();
};
