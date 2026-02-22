import { Request, Response } from "express";
import System from "../models/system.model";

async function getSystemDoc() {
  let doc = await System.findOne();
  if (!doc) doc = await System.create({});
  return doc;
}

// GET STATUS
export const getSystem = async (_req: Request, res: Response) => {
  const doc = await getSystemDoc();
  res.json(doc);
};

// DEPLOY
export const deploySite = async (_req: Request, res: Response) => {
  const doc = await getSystemDoc();
  doc.status = "live";
  await doc.save();
  res.json({ message: "Website deployed" });
};

// FREEZE
export const freezeSite = async (_req: Request, res: Response) => {
  const doc = await getSystemDoc();
  doc.status = "frozen";
  await doc.save();
  res.json({ message: "Website frozen" });
};

// UNFREEZE
export const unfreezeSite = async (_req: Request, res: Response) => {
  const doc = await getSystemDoc();
  doc.status = "live";
  await doc.save();
  res.json({ message: "Website live again" });
};

// CREATE VERSION
export const createVersion = async (_req: Request, res: Response) => {
  const doc = await getSystemDoc();
  const name = "v1." + (doc.versions.length + 1);
  doc.versions.unshift({ name, createdAt: new Date() });
  await doc.save();
  res.json({ message: "Version created", versions: doc.versions });
};

// CREATE BACKUP
export const createBackup = async (_req: Request, res: Response) => {
  const doc = await getSystemDoc();
  const name = "Backup #" + (doc.backups.length + 1);
  doc.backups.unshift({ name, createdAt: new Date() });
  await doc.save();
  res.json({ message: "Backup created", backups: doc.backups });
};

// RESTORE
export const restoreBackup = async (req: Request, res: Response) => {
  const doc = await getSystemDoc();
  const backup = doc.backups.id(req.params.id);
  if (!backup) return res.status(404).json({ message: "Backup not found" });
  res.json({ message: "Backup restored", backup });
};

// EMERGENCY SHUTDOWN
export const emergencyShutdown = async (_req: Request, res: Response) => {
  const doc = await getSystemDoc();
  doc.status = "shutdown";
  await doc.save();
  res.json({ message: "Emergency shutdown activated" });
};

// EMERGENCY RECOVER
export const emergencyRecover = async (_req: Request, res: Response) => {
  const doc = await getSystemDoc();
  doc.status = "live";
  await doc.save();
  res.json({ message: "System recovered" });
};
