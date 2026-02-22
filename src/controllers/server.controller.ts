import { Request, Response } from "express";
import Server from "../models/server.model";

/* =========================
   GET ALL SERVERS
========================= */
export const getServers = async (_req: Request, res: Response) => {
  const servers = await Server.find().sort({ priority: 1 });
  res.json(servers);
};

/* =========================
   ADD / UPDATE SERVER
========================= */
export const saveServer = async (req: Request, res: Response) => {
  const { _id, ...data } = req.body;

  if (_id) {
    await Server.findByIdAndUpdate(_id, data);
  } else {
    await Server.create(data);
  }

  res.json({ message: "Server saved" });
};

/* =========================
   DELETE SERVER
========================= */
export const deleteServer = async (req: Request, res: Response) => {
  const { id } = req.body;

  await Server.findByIdAndDelete(id);

  res.json({ message: "Server deleted" });
};
