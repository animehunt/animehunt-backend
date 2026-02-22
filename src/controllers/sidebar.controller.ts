import { Request, Response } from "express";
import Sidebar from "../models/sidebar.model";

/* =========================
   GET SIDEBAR ITEMS
========================= */
export const getSidebar = async (_req: Request, res: Response) => {
  const items = await Sidebar.find().sort({ priority: 1 });
  res.json(items);
};

/* =========================
   ADD / UPDATE ITEM
========================= */
export const saveSidebar = async (req: Request, res: Response) => {
  const { _id, ...data } = req.body;

  if (_id) {
    await Sidebar.findByIdAndUpdate(_id, data);
  } else {
    await Sidebar.create(data);
  }

  res.json({ message: "Sidebar updated" });
};

/* =========================
   DELETE ITEM
========================= */
export const deleteSidebar = async (req: Request, res: Response) => {
  const { id } = req.body;

  await Sidebar.findByIdAndDelete(id);

  res.json({ message: "Sidebar deleted" });
};
/* =========================
   PUBLIC SIDEBAR (FILTERED)
========================= */
export const getPublicSidebar = async (req: Request, res: Response) => {
  const { device, userType } = req.query;

  const items = await Sidebar.find({
    active: true,
    $and: [
      { $or: [{ device: "All" }, { device }] },
      { $or: [{ visibility: "All" }, { visibility: userType }] }
    ]
  }).sort({ priority: 1 });

  res.json(items);
};
