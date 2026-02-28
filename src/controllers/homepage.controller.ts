import { Request, Response } from "express";
import HomepageRow from "../models/HomepageRow.model";

/* ===========================
   CREATE
=========================== */
export const createRow = async (req: Request, res: Response) => {
  try {
    const row = await HomepageRow.create(req.body);
    res.status(201).json(row);
  } catch {
    res.status(500).json({ message: "Create failed" });
  }
};

/* ===========================
   GET ALL
=========================== */
export const getRows = async (_req: Request, res: Response) => {
  try {
    const rows = await HomepageRow.find()
      .sort({ order: 1 });
    res.json(rows);
  } catch {
    res.status(500).json({ message: "Fetch failed" });
  }
};

/* ===========================
   GET SINGLE
=========================== */
export const getSingleRow = async (
  req: Request,
  res: Response
) => {
  try {
    const row = await HomepageRow.findById(req.params.id);
    if (!row)
      return res.status(404).json({ message: "Not found" });

    res.json(row);
  } catch {
    res.status(500).json({ message: "Fetch failed" });
  }
};

/* ===========================
   UPDATE
=========================== */
export const updateRow = async (
  req: Request,
  res: Response
) => {
  try {
    const row = await HomepageRow.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!row)
      return res.status(404).json({ message: "Not found" });

    res.json(row);
  } catch {
    res.status(500).json({ message: "Update failed" });
  }
};

/* ===========================
   DELETE
=========================== */
export const deleteRow = async (
  req: Request,
  res: Response
) => {
  try {
    await HomepageRow.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ message: "Delete failed" });
  }
};
