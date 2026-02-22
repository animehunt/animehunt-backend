import { Request, Response } from "express";
import Anime from "../models/anime.model";

// CREATE
export const createAnime = async (req: Request, res: Response) => {
  try {
    const anime = await Anime.create(req.body);
    res.status(201).json(anime);
  } catch (err) {
    res.status(400).json({ message: "Anime creation failed" });
  }
};

// GET ALL
export const getAnime = async (req: Request, res: Response) => {
  const { type, status, home, search } = req.query;

  let filter: any = {};

  if (type) filter.type = type;
  if (status) filter.status = status;
  if (home === "yes") filter.isHome = true;
  if (home === "no") filter.isHome = false;
  if (search) filter.title = { $regex: search, $options: "i" };

  const anime = await Anime.find(filter).sort({ createdAt: -1 });

  res.json(anime);
};

// UPDATE
export const updateAnime = async (req: Request, res: Response) => {
  try {
    const updated = await Anime.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(updated);
  } catch {
    res.status(400).json({ message: "Update failed" });
  }
};

// DELETE
export const deleteAnime = async (req: Request, res: Response) => {
  await Anime.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted" });
};
