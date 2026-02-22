import { Request, Response } from "express";
import HomepageRow from "../models/homepage.model";

// GET ALL ROWS
export const getHomepageRows = async (_req: Request, res: Response) => {
  const rows = await HomepageRow.find().sort({ order: 1 });
  res.json(rows);
};

// CREATE OR UPDATE
export const saveHomepageRow = async (req: Request, res: Response) => {
  const { id, ...data } = req.body;

  if (id) {
    await HomepageRow.findByIdAndUpdate(id, data);
    return res.json({ message: "Row updated" });
  }

  await HomepageRow.create(data);
  res.status(201).json({ message: "Row created" });
};

// DELETE
export const deleteHomepageRow = async (req: Request, res: Response) => {
  const { id } = req.body;
  await HomepageRow.findByIdAndDelete(id);
  res.json({ message: "Row deleted" });
};
