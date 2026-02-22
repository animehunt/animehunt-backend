import { Request, Response } from "express";
import Server from "../models/server.model";

/* =========================
   GET SERVERS FOR EPISODE
========================= */
export const getEpisodeServers = async (req: Request, res: Response) => {
  const { anime, season, episode } = req.query;

  const servers = await Server.find({
    anime,
    season: Number(season),
    episode: Number(episode),
    active: true
  }).sort({ priority: 1 });

  res.json(servers);
};
