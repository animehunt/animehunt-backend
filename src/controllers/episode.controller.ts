import { Request, Response } from "express";
import Episode from "../models/Episode.model";

/* ===========================
   CREATE
=========================== */
export const createEpisode = async (req: Request, res: Response) => {
  try {
    const episode = await Episode.create(req.body);
    res.status(201).json(episode);
  } catch {
    res.status(500).json({ message: "Create failed" });
  }
};

/* ===========================
   GET ALL
=========================== */
export const getEpisodes = async (_req: Request, res: Response) => {
  try {
    const episodes = await Episode.find().sort({ createdAt: -1 });
    res.json(episodes);
  } catch {
    res.status(500).json({ message: "Fetch failed" });
  }
};

/* ===========================
   GET SINGLE
=========================== */
export const getSingleEpisode = async (
  req: Request,
  res: Response
) => {
  try {
    const episode = await Episode.findById(req.params.id);
    if (!episode)
      return res.status(404).json({ message: "Not found" });

    res.json(episode);
  } catch {
    res.status(500).json({ message: "Fetch failed" });
  }
};

/* ===========================
   UPDATE
=========================== */
export const updateEpisode = async (
  req: Request,
  res: Response
) => {
  try {
    const episode = await Episode.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!episode)
      return res.status(404).json({ message: "Not found" });

    res.json(episode);
  } catch {
    res.status(500).json({ message: "Update failed" });
  }
};

/* ===========================
   DELETE
=========================== */
export const deleteEpisode = async (
  req: Request,
  res: Response
) => {
  try {
    await Episode.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ message: "Delete failed" });
  }
};
