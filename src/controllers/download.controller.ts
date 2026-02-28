import { Request, Response } from "express";
import Download from "../models/Download.model";

/* ===========================
   GET ALL
=========================== */
export const getDownloads = async (_req: Request, res: Response) => {
  try {
    const downloads = await Download.find().sort({ createdAt: -1 });
    res.json(downloads);
  } catch {
    res.status(500).json({ message: "Fetch failed" });
  }
};

/* ===========================
   BULK CREATE
=========================== */
export const bulkCreateDownloads = async (
  req: Request,
  res: Response
) => {
  try {
    if (!Array.isArray(req.body))
      return res.status(400).json({ message: "Invalid payload" });

    const valid = req.body.filter(
      (d) =>
        d.anime &&
        d.season &&
        d.episode &&
        d.host &&
        d.quality &&
        d.link
    );

    if (!valid.length)
      return res.status(400).json({ message: "No valid data" });

    await Download.insertMany(valid);

    res.status(201).json({ success: true });
  } catch {
    res.status(500).json({ message: "Bulk insert failed" });
  }
};

/* ===========================
   DELETE
=========================== */
export const deleteDownload = async (
  req: Request,
  res: Response
) => {
  try {
    await Download.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ message: "Delete failed" });
  }
};
