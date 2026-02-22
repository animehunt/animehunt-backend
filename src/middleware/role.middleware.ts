import { Request, Response, NextFunction } from "express";

export const requireRole = (role: string) => {
  return (req: any, res: Response, next: NextFunction) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (req.admin.role !== role) {
      return res.status(403).json({
        success: false,
        message: "Forbidden – Insufficient role",
      });
    }

    next();
  };
};
