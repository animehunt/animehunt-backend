import { Router } from "express";
import {
  createEpisode,
  getEpisodes,
  getSingleEpisode,
  updateEpisode,
  deleteEpisode
} from "../controllers/episode.controller";

const router = Router();

router.get("/", getEpisodes);
router.get("/:id", getSingleEpisode);
router.post("/", createEpisode);
router.patch("/:id", updateEpisode);
router.delete("/:id", deleteEpisode);

export default router;
