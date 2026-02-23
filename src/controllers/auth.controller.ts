import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { Resend } from "resend";
import Admin from "../models/admin.model";

const resend = new Resend(process.env.RESEND_API_KEY);

/* =========================
   LOGIN
========================= */
export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(401).json({ message: "Invalid" });

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(401).json({ message: "Invalid" });

    // 🔐 Generate 16 char token
    const token = crypto.randomBytes(8).toString("hex");
    const hash = crypto.createHash("sha256").update(token).digest("hex");

    admin.otpHash = hash;
    admin.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await admin.save();

    // 📧 Send via Resend
    await resend.emails.send({
      from: "AnimeHunt <no-reply@animehunt.fun>",
      to: admin.email,
      subject: "AnimeHunt Admin Login Token",
      html: `
        <div style="font-family:sans-serif">
          <h2>AnimeHunt Admin Login</h2>
          <p>Your verification token:</p>
          <h1>${token}</h1>
          <p>This token expires in 10 minutes.</p>
        </div>
      `,
    });

    res.json({ message: "Token sent" });

  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

/* =========================
   VERIFY TOKEN
========================= */
export const verify = async (req: Request, res: Response) => {
  try {
    const { username, token } = req.body;

    const admin = await Admin.findOne({ username });
    if (!admin || !admin.otpHash)
      return res.status(401).json({ message: "Invalid" });

    if (!admin.otpExpiry || admin.otpExpiry < new Date())
      return res.status(401).json({ message: "Expired" });

    const hash = crypto.createHash("sha256").update(token).digest("hex");

    if (hash !== admin.otpHash)
      return res.status(401).json({ message: "Invalid" });

    // Clear OTP
    admin.otpHash = undefined;
    admin.otpExpiry = undefined;
    await admin.save();

    // 🔐 JWT
    const accessToken = jwt.sign(
      {
        id: admin._id,
        username: admin.username,
        role: admin.role || "admin",
      },
      process.env.JWT_SECRET!,
      { expiresIn: "15m" }
    );

    res.json({ accessToken });

  } catch (error) {
    console.error("Verify Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};
