import { Router } from "express";
import {
  createAnime,
  getAnime,
  getSingleAnime,
  updateAnime,
  deleteAnime
} from "../controllers/anime.controller";

const router = Router();

router.get("/", getAnime);
router.get("/:id", getSingleAnime);
router.post("/", createAnime);
router.patch("/:id", updateAnime);
router.delete("/:id", deleteAnime);

export default router;
