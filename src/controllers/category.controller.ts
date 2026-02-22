import { Request, Response } from "express";
import Category from "../models/category.model";

// GET ALL
export const getCategories = async (_req: Request, res: Response) => {
  const categories = await Category.find().sort({ order: 1 });
  res.json(categories);
};

// CREATE
export const createCategory = async (req: Request, res: Response) => {
  try {
    const category = await Category.create(req.body);
    res.status(201).json(category);
  } catch {
    res.status(400).json({ message: "Category creation failed" });
  }
};

// UPDATE
export const updateCategory = async (req: Request, res: Response) => {
  const updated = await Category.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );
  res.json(updated);
};

// TOGGLE ACTIVE
export const toggleCategory = async (req: Request, res: Response) => {
  const category = await Category.findById(req.params.id);
  if (!category) return res.status(404).json({ message: "Not found" });

  category.active = !category.active;
  await category.save();

  res.json(category);
};

// DELETE
export const deleteCategory = async (req: Request, res: Response) => {
  await Category.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted" });
};
