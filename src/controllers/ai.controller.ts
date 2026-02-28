import { Request, Response } from "express";
import AiSettings from "../models/AiSettings.model";

/* ===========================
   GET AI SETTINGS
=========================== */
export const getAISettings = async (_req: Request, res: Response) => {
  try {
    let settings = await AiSettings.findOne();

    if (!settings) {
      settings = await AiSettings.create({});
    }

    res.json({
      ...settings.engines,
      paused: settings.paused
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch AI settings" });
  }
};

/* ===========================
   UPDATE SINGLE SETTING
=========================== */
export const updateAISetting = async (req: Request, res: Response) => {
  try {
    const { engine, setting, value } = req.body;

    if (!engine || !setting)
      return res.status(400).json({ message: "Invalid payload" });

    let settings = await AiSettings.findOne();

    if (!settings) {
      settings = await AiSettings.create({});
    }

    if (!settings.engines[engine]) {
      settings.engines[engine] = {};
    }

    settings.engines[engine][setting] = value;

    await settings.save();

    res.json({ message: "AI setting updated" });
  } catch (error) {
    res.status(500).json({ message: "Update failed" });
  }
};

/* ===========================
   PAUSE ALL AI
=========================== */
export const pauseAI = async (_req: Request, res: Response) => {
  try {
    let settings = await AiSettings.findOne();

    if (!settings) {
      settings = await AiSettings.create({});
    }

    settings.paused = !settings.paused;

    await settings.save();

    res.json({ paused: settings.paused });
  } catch (error) {
    res.status(500).json({ message: "Pause failed" });
  }
};
