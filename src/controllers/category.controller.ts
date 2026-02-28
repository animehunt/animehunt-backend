import { Request, Response } from "express";
import Category from "../models/Category.model";

/* ===========================
   CREATE
=========================== */
export const createCategory = async (req: Request, res: Response) => {
  try {
    if (!req.body.slug && req.body.name) {
      req.body.slug = req.body.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-");
    }

    const exists = await Category.findOne({ slug: req.body.slug });
    if (exists)
      return res.status(400).json({ message: "Slug already exists" });

    const category = await Category.create(req.body);
    res.status(201).json(category);
  } catch {
    res.status(500).json({ message: "Create failed" });
  }
};

/* ===========================
   GET ALL
=========================== */
export const getCategories = async (_req: Request, res: Response) => {
  try {
    const categories = await Category.find().sort({
      order: 1,
      priority: 1
    });

    res.json(categories);
  } catch {
    res.status(500).json({ message: "Fetch failed" });
  }
};

/* ===========================
   GET SINGLE
=========================== */
export const getSingleCategory = async (req: Request, res: Response) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category)
      return res.status(404).json({ message: "Not found" });

    res.json(category);
  } catch {
    res.status(500).json({ message: "Fetch failed" });
  }
};

/* ===========================
   UPDATE
=========================== */
export const updateCategory = async (req: Request, res: Response) => {
  try {
    if (req.body.slug) {
      const exists = await Category.findOne({
        slug: req.body.slug,
        _id: { $ne: req.params.id }
      });

      if (exists)
        return res.status(400).json({ message: "Slug already in use" });
    }

    const category = await Category.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!category)
      return res.status(404).json({ message: "Not found" });

    res.json(category);
  } catch {
    res.status(500).json({ message: "Update failed" });
  }
};

/* ===========================
   TOGGLE ACTIVE
=========================== */
export const toggleCategory = async (req: Request, res: Response) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category)
      return res.status(404).json({ message: "Not found" });

    category.active = !category.active;
    await category.save();

    res.json({ active: category.active });
  } catch {
    res.status(500).json({ message: "Toggle failed" });
  }
};

/* ===========================
   DELETE
=========================== */
export const deleteCategory = async (req: Request, res: Response) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ message: "Delete failed" });
  }
};
