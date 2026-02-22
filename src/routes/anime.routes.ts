import express from "express";
import {
  createAnime,
  getAnime,
  updateAnime,
  deleteAnime
} from "../controllers/anime.controller";

const router = express.Router();

router.post("/", createAnime);
router.get("/", getAnime);
router.patch("/:id", updateAnime);
router.delete("/:id", deleteAnime);

export default router;
