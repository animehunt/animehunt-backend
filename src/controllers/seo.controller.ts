import { Request, Response } from "express";
import SEO from "../models/seo.model";

/* =========================
   GET SEO CONFIG
========================= */
export const getSEO = async (_req: Request, res: Response) => {
  let config = await SEO.findOne();

  if (!config) {
    config = await SEO.create({
      global: {},
      home: {},
      templates: {},
      social: {}
    });
  }

  res.json(config);
};

/* =========================
   SAVE SEO CONFIG
========================= */
export const saveSEO = async (req: Request, res: Response) => {
  let config = await SEO.findOne();

  if (!config) {
    config = await SEO.create(req.body);
  } else {
    Object.assign(config, req.body);
    await config.save();
  }

  res.json({ message: "SEO updated" });
};
