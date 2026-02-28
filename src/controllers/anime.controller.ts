import { Request, Response } from "express";
import Anime from "../models/Anime.model";

/* ===========================
   CREATE
=========================== */
export const createAnime = async (req: Request, res: Response) => {
  try {
    const existing = await Anime.findOne({ slug: req.body.slug });
    if (existing)
      return res.status(400).json({ message: "Slug already exists" });

    const anime = await Anime.create(req.body);
    res.status(201).json(anime);
  } catch (error) {
    res.status(500).json({ message: "Create failed" });
  }
};

/* ===========================
   GET ALL (FILTER SUPPORT)
=========================== */
export const getAnime = async (req: Request, res: Response) => {
  try {
    const { type, status, home, search } = req.query;

    const filter: any = {};

    if (type) filter.type = type;
    if (status) filter.status = status;
    if (home === "yes") filter.isHome = true;
    if (home === "no") filter.isHome = false;

    if (search) {
      filter.title = { $regex: search, $options: "i" };
    }

    const anime = await Anime.find(filter).sort({ createdAt: -1 });

    res.json(anime);
  } catch {
    res.status(500).json({ message: "Fetch failed" });
  }
};

/* ===========================
   GET SINGLE
=========================== */
export const getSingleAnime = async (req: Request, res: Response) => {
  try {
    const anime = await Anime.findById(req.params.id);
    if (!anime)
      return res.status(404).json({ message: "Not found" });

    res.json(anime);
  } catch {
    res.status(500).json({ message: "Fetch failed" });
  }
};

/* ===========================
   UPDATE
=========================== */
export const updateAnime = async (req: Request, res: Response) => {
  try {
    const anime = await Anime.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!anime)
      return res.status(404).json({ message: "Not found" });

    res.json(anime);
  } catch {
    res.status(500).json({ message: "Update failed" });
  }
};

/* ===========================
   DELETE
=========================== */
export const deleteAnime = async (req: Request, res: Response) => {
  try {
    await Anime.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ message: "Delete failed" });
  }
};
