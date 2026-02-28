import { Request, Response } from "express";
import Anime from "../models/Anime.model";

/* ===============================
   CREATE ANIME
================================ */
export const createAnime = async (req: Request, res: Response) => {
  try {
    const existing = await Anime.findOne({ slug: req.body.slug });

    if (existing) {
      return res.status(400).json({
        message: "Slug already exists. Please change title."
      });
    }

    const anime = await Anime.create(req.body);

    res.status(201).json(anime);

  } catch (error: any) {
    res.status(500).json({
      message: error.message || "Create failed"
    });
  }
};

/* ===============================
   GET ALL
================================ */
export const getAllAnime = async (req: Request, res: Response) => {
  try {
    const { type, status, search } = req.query;

    const filter: any = {};

    if (type) filter.type = type;
    if (status) filter.status = status;

    if (search) {
      filter.title = { $regex: search, $options: "i" };
    }

    const data = await Anime.find(filter).sort({ createdAt: -1 });

    res.json(data);

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* ===============================
   GET ONE
================================ */
export const getAnimeById = async (req: Request, res: Response) => {
  try {
    const anime = await Anime.findById(req.params.id);

    if (!anime) {
      return res.status(404).json({ message: "Anime not found" });
    }

    res.json(anime);

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* ===============================
   UPDATE
================================ */
export const updateAnime = async (req: Request, res: Response) => {
  try {

    const duplicate = await Anime.findOne({
      slug: req.body.slug,
      _id: { $ne: req.params.id }
    });

    if (duplicate) {
      return res.status(400).json({
        message: "Slug already used by another anime"
      });
    }

    const updated = await Anime.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json(updated);

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* ===============================
   DELETE
================================ */
export const deleteAnime = async (req: Request, res: Response) => {
  try {
    await Anime.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted successfully" });

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
