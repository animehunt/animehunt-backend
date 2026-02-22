import { Request, Response } from "express";
import Episode from "../models/episode.model";

// GET ALL
export const getEpisodes = async (_req: Request, res: Response) => {
  const episodes = await Episode.find().sort({ createdAt: -1 });
  res.json(episodes);
};

// CREATE
export const createEpisode = async (req: Request, res: Response) => {
  try {
    const episode = await Episode.create(req.body);
    res.status(201).json(episode);
  } catch (err) {
    res.status(400).json({ message: "Episode creation failed" });
  }
};

// DELETE
export const deleteEpisode = async (req: Request, res: Response) => {
  const { id } = req.body;
  await Episode.findByIdAndDelete(id);
  res.json({ message: "Episode deleted" });
};
