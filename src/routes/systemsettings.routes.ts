import { Request, Response } from "express";

let systemState = {
  killed: false,
  config: {}
};

/* ===========================
   GET SYSTEM
=========================== */
export const getSystem = async (_req: Request, res: Response) => {
  res.json(systemState);
};

/* ===========================
   SAVE SYSTEM CONFIG
=========================== */
export const saveSystem = async (req: Request, res: Response) => {
  systemState.config = req.body;
  res.json({
    success: true,
    message: "System config saved",
    data: systemState
  });
};

/* ===========================
   KILL SYSTEM
=========================== */
export const killSystem = async (_req: Request, res: Response) => {
  systemState.killed = true;

  res.json({
    success: true,
    message: "System halted"
  });
};
