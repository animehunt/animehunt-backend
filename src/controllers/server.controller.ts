import { Request, Response } from "express";
import Server from "../models/Server.model";

/* ===========================
   GET ALL SERVERS
=========================== */
export const getServers = async (_req: Request, res: Response) => {
  try {
    const servers = await Server.find().lean();
    res.json(servers);
  } catch {
    res.status(500).json({ message: "Failed to load servers" });
  }
};

/* ===========================
   ADD OR UPDATE SERVER
=========================== */
export const saveServer = async (req: Request, res: Response) => {
  try {
    const { _id, name, anime, season, episode, embed, priority, active } =
      req.body;

    if (!name || !anime) {
      return res.status(400).json({ message: "Name and Anime required" });
    }

    /* Validate URL */
    if (embed) {
      try {
        new URL(embed);
      } catch {
        return res.status(400).json({ message: "Invalid embed URL" });
      }
    }

    if (_id) {
      const updated = await Server.findByIdAndUpdate(
        _id,
        {
          name,
          anime,
          season,
          episode,
          embed,
          priority: Number(priority ?? 99),
          active: !!active
        },
        { new: true }
      );

      return res.json(updated);
    }

    const created = await Server.create({
      name,
      anime,
      season,
      episode,
      embed,
      priority: Number(priority ?? 99),
      active: !!active
    });

    res.json(created);
  } catch {
    res.status(500).json({ message: "Server save failed" });
  }
};

/* ===========================
   DELETE SERVER
=========================== */
export const deleteServer = async (req: Request, res: Response) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ message: "Server ID required" });
    }

    await Server.findByIdAndDelete(id);

    res.json({ success: true });
  } catch {
    res.status(500).json({ message: "Delete failed" });
  }
};
