import { Request, Response } from "express";
import Deploy from "../models/Deploy.model";
import { v4 as uuid } from "uuid";

/* Ensure single deploy doc */
async function getDeployDoc() {
  let doc = await Deploy.findOne();
  if (!doc) doc = await Deploy.create({});
  return doc;
}

/* ===========================
   GET STATE
=========================== */
export const getDeployData = async (_req: Request, res: Response) => {
  try {
    const doc = await getDeployDoc();
    res.json(doc);
  } catch {
    res.status(500).json({ message: "Fetch failed" });
  }
};

/* ===========================
   DEPLOY
=========================== */
export const deploySite = async (_req: Request, res: Response) => {
  try {
    const doc = await getDeployDoc();

    doc.versions.push({
      name: `v${doc.versions.length + 1}`,
      date: new Date().toLocaleString()
    });

    await doc.save();
    res.json({ message: "Deployment logged" });
  } catch {
    res.status(500).json({ message: "Deploy failed" });
  }
};

/* ===========================
   FREEZE
=========================== */
export const freezeSite = async (_req: Request, res: Response) => {
  try {
    const doc = await getDeployDoc();
    doc.frozen = true;
    await doc.save();
    res.json({ frozen: true });
  } catch {
    res.status(500).json({ message: "Freeze failed" });
  }
};

/* ===========================
   UNFREEZE
=========================== */
export const unfreezeSite = async (_req: Request, res: Response) => {
  try {
    const doc = await getDeployDoc();
    doc.frozen = false;
    await doc.save();
    res.json({ frozen: false });
  } catch {
    res.status(500).json({ message: "Unfreeze failed" });
  }
};

/* ===========================
   CREATE VERSION
=========================== */
export const createVersion = async (_req: Request, res: Response) => {
  try {
    const doc = await getDeployDoc();

    doc.versions.push({
      name: `v${doc.versions.length + 1}`,
      date: new Date().toLocaleString()
    });

    await doc.save();
    res.json({ versions: doc.versions });
  } catch {
    res.status(500).json({ message: "Version failed" });
  }
};

/* ===========================
   CREATE BACKUP
=========================== */
export const createBackup = async (_req: Request, res: Response) => {
  try {
    const doc = await getDeployDoc();

    doc.backups.push({
      id: uuid(),
      name: `backup-${doc.backups.length + 1}`,
      date: new Date().toLocaleString()
    });

    await doc.save();
    res.json({ backups: doc.backups });
  } catch {
    res.status(500).json({ message: "Backup failed" });
  }
};

/* ===========================
   RESTORE
=========================== */
export const restoreBackup = async (req: Request, res: Response) => {
  try {
    const doc = await getDeployDoc();

    const exists = doc.backups.find(b => b.id === req.params.id);
    if (!exists)
      return res.status(404).json({ message: "Backup not found" });

    res.json({ message: "Restore simulated" });
  } catch {
    res.status(500).json({ message: "Restore failed" });
  }
};

/* ===========================
   EMERGENCY SHUTDOWN
=========================== */
export const emergencyShutdown = async (_req: Request, res: Response) => {
  try {
    const doc = await getDeployDoc();
    doc.emergency = true;
    await doc.save();
    res.json({ emergency: true });
  } catch {
    res.status(500).json({ message: "Shutdown failed" });
  }
};

/* ===========================
   EMERGENCY RECOVER
=========================== */
export const emergencyRecover = async (_req: Request, res: Response) => {
  try {
    const doc = await getDeployDoc();
    doc.emergency = false;
    await doc.save();
    res.json({ emergency: false });
  } catch {
    res.status(500).json({ message: "Recover failed" });
  }
};
