import express from "express";
import {
  getEpisodes,
  createEpisode,
  deleteEpisode
} from "../controllers/episode.controller";

const router = express.Router();

router.get("/admin/episodes", getEpisodes);
router.post("/admin/episodes", createEpisode);
router.delete("/admin/episodes", deleteEpisode);

export default router;
