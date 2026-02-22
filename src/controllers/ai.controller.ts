import { Request, Response } from "express";
import AI from "../models/ai.model";

// Get AI Settings
export const getAI = async (_req: Request, res: Response) => {
  let config = await AI.findOne();

  if (!config) {
    config = await AI.create({});
  }

  res.json(config);
};

// Update AI Settings
export const updateAI = async (req: Request, res: Response) => {
  let config = await AI.findOne();

  if (!config) {
    config = await AI.create({});
  }

  Object.assign(config, req.body);

  await config.save();

  res.json({ message: "AI Settings Updated", config });
};

// Pause All AI
export const togglePause = async (_req: Request, res: Response) => {
  let config = await AI.findOne();

  if (!config) {
    config = await AI.create({});
  }

  config.paused = !config.paused;

  await config.save();

  res.json({ paused: config.paused });
};
