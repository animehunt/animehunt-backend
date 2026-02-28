import { Request, Response } from "express";

/* 
   ⚠ Replace these with real monitoring logic later:
   Redis counters, rate limiter stats, etc.
*/

export const getSecurityStats = async (_req: Request, res: Response) => {
  try {
    res.json({
      blockedIPs: Math.floor(Math.random() * 50),
      liveUsers: Math.floor(Math.random() * 300),
      reqPerSec: Math.floor(Math.random() * 120),
      blockedReq: Math.floor(Math.random() * 20)
    });
  } catch {
    res.status(500).json({ message: "Stats error" });
  }
};
