import express from "express";
import {
  createAnime,
  getAllAnime,
  getAnimeById,
  updateAnime,
  deleteAnime
} from "../controllers/anime.controller";

const router = express.Router();

router.get("/", getAllAnime);
router.get("/:id", getAnimeById);
router.post("/", createAnime);
router.patch("/:id", updateAnime);
router.delete("/:id", deleteAnime);

export default router;
