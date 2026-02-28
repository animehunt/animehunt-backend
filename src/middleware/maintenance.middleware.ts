import { Request, Response, NextFunction } from "express";
import Deploy from "../models/Deploy.model";

export const maintenanceCheck = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  const doc = await Deploy.findOne();

  if (doc?.emergency) {
    return res.status(503).json({ message: "Emergency Shutdown Active" });
  }

  if (doc?.frozen) {
    return res.status(503).json({ message: "Site Under Maintenance" });
  }

  next();
};
