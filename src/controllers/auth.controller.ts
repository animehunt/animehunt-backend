import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import Admin from "../models/admin.model";

export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    const admin = await Admin.findOne({ username });
    if (!admin)
      return res.status(401).json({ message: "Invalid credentials" });

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid)
      return res.status(401).json({ message: "Invalid credentials" });

    return res.json({ success: true });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
