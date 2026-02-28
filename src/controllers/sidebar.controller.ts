import { Request, Response } from "express";
import Sidebar from "../models/Sidebar.model";

/* ===========================
   GET ALL SIDEBAR ITEMS
=========================== */
export const getSidebarItems = async (_req: Request, res: Response) => {
  try {
    const items = await Sidebar.find().lean();
    res.json(items);
  } catch {
    res.status(500).json({ message: "Failed to load sidebar items" });
  }
};

/* ===========================
   ADD OR UPDATE ITEM
=========================== */
export const saveSidebarItem = async (req: Request, res: Response) => {
  try {
    const {
      _id,
      title,
      icon,
      url,
      device,
      visibility,
      highlight,
      badge,
      priority,
      active,
      newTab
    } = req.body;

    if (!title || !url) {
      return res.status(400).json({ message: "Title and URL required" });
    }

    /* Validate URL */
    if (!url.startsWith("/")) {
      try {
        new URL(url);
      } catch {
        return res.status(400).json({ message: "Invalid URL" });
      }
    }

    if (_id) {
      const updated = await Sidebar.findByIdAndUpdate(
        _id,
        {
          title,
          icon,
          url,
          device,
          visibility,
          highlight,
          badge,
          priority: Math.max(1, Math.min(99, Number(priority ?? 99))),
          active: !!active,
          newTab: !!newTab
        },
        { new: true }
      );

      return res.json(updated);
    }

    const created = await Sidebar.create({
      title,
      icon,
      url,
      device,
      visibility,
      highlight,
      badge,
      priority: Math.max(1, Math.min(99, Number(priority ?? 99))),
      active: !!active,
      newTab: !!newTab
    });

    res.json(created);
  } catch {
    res.status(500).json({ message: "Save failed" });
  }
};

/* ===========================
   DELETE ITEM
=========================== */
export const deleteSidebarItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ message: "Item ID required" });
    }

    await Sidebar.findByIdAndDelete(id);

    res.json({ success: true });
  } catch {
    res.status(500).json({ message: "Delete failed" });
  }
};
