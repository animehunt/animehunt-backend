import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import Admin from "../models/admin.model";
dotenv.config();

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);

    const existing = await Admin.findOne({ username: "anime_moderator_007" });
    if (existing) {
      console.log("⚠ Admin already exists");
      process.exit();
    }

    const hashedPassword = await bcrypt.hash(
      "@N!m3★Ch@nch@l#2024$Secure!",
      10
    );

    await Admin.create({
      username: "anime_moderator_007",
      email: "nakulmalviya256@gmail.com",
      password: hashedPassword,
    });

    console.log("✅ Admin Created Successfully");
    process.exit();
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

createAdmin();
