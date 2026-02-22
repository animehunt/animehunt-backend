import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";
import Admin from "../models/admin.model";

/* =========================
   LOGIN
========================= */
export const login = async (req: Request, res: Response) => {
  const { username, password } = req.body;

  const admin = await Admin.findOne({ username });
  if (!admin) return res.status(401).json({ message: "Invalid" });

  const valid = await bcrypt.compare(password, admin.password);
  if (!valid) return res.status(401).json({ message: "Invalid" });

  // 🔐 generate 16 char token
  const token = crypto.randomBytes(8).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");

  admin.otpHash = hash;
  admin.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min
  await admin.save();

  // 📧 send email
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.MAIL_USER,
    to: admin.email,
    subject: "AnimeHunt Admin Login Token",
    text: `Your verification token: ${token}`
  });

  res.json({ message: "Token sent" });
};

/* =========================
   VERIFY TOKEN
========================= */
export const verify = async (req: Request, res: Response) => {
  const { username, token } = req.body;

  const admin = await Admin.findOne({ username });
  if (!admin || !admin.otpHash)
    return res.status(401).json({ message: "Invalid" });

  if (!admin.otpExpiry || admin.otpExpiry < new Date())
    return res.status(401).json({ message: "Expired" });

  const hash = crypto.createHash("sha256").update(token).digest("hex");

  if (hash !== admin.otpHash)
    return res.status(401).json({ message: "Invalid" });

  // 🔥 clear OTP
  admin.otpHash = undefined;
  admin.otpExpiry = undefined;
  await admin.save();

  // 🔐 JWT
  const accessToken = jwt.sign(
    { id: admin._id, username: admin.username },
    process.env.JWT_SECRET!,
    { expiresIn: "15M" }
  );

  res.json({ accessToken });
};
