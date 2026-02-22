import { Request, Response } from "express";
import Footer from "../models/footer.model";

/* =========================
   GET FOOTER CONFIG
========================= */
export const getFooter = async (_req: Request, res: Response) => {
  let footer = await Footer.findOne();

  if (!footer) {
    footer = await Footer.create({});
  }

  res.json(footer);
};

/* =========================
   SAVE / UPDATE FOOTER
========================= */
export const saveFooter = async (req: Request, res: Response) => {
  let footer = await Footer.findOne();

  if (!footer) {
    footer = await Footer.create(req.body);
  } else {
    Object.assign(footer, req.body);
    await footer.save();
  }

  res.json({ message: "Footer saved" });
};

/* =========================
   KILL FOOTER (GLOBAL OFF)
========================= */
export const killFooter = async (_req: Request, res: Response) => {
  let footer = await Footer.findOne();

  if (!footer) {
    footer = await Footer.create({ footerOn: false });
  } else {
    footer.footerOn = false;
    await footer.save();
  }

  res.json({ message: "Footer disabled globally" });
};
