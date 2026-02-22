import { Request, Response } from "express";
import Download from "../models/download.model";

// GET ALL
export const getDownloads = async (_req: Request, res: Response) => {
  const downloads = await Download.find().sort({ createdAt: -1 });
  res.json(downloads);
};

// CREATE
export const createDownload = async (req: Request, res: Response) => {
  try {
    const download = await Download.create(req.body);
    res.status(201).json(download);
  } catch {
    res.status(400).json({ message: "Download creation failed" });
  }
};

// DELETE
export const deleteDownload = async (req: Request, res: Response) => {
  const { id } = req.body;
  await Download.findByIdAndDelete(id);
  res.json({ message: "Deleted" });
};
