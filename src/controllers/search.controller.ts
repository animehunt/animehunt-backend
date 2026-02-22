import { Request, Response } from "express";
import Search from "../models/search.model";

/* =========================
   GET SEARCH CONFIG
========================= */
export const getSearch = async (_req: Request, res: Response) => {
  let config = await Search.findOne();

  if (!config) {
    config = await Search.create({});
  }

  res.json(config);
};

/* =========================
   SAVE SEARCH CONFIG
========================= */
export const saveSearch = async (req: Request, res: Response) => {
  let config = await Search.findOne();

  if (!config) {
    config = await Search.create(req.body);
  } else {
    Object.assign(config, req.body);
    await config.save();
  }

  res.json({ message: "Search settings updated" });
};
