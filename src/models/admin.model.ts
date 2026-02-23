import mongoose, { Schema, Document } from "mongoose";

export interface IAdmin extends Document {
  username: string;
  password: string;
  email: string;
  role: string;            // ✅ ADD THIS
  otpHash?: string;
  otpExpiry?: Date;
}

const AdminSchema = new Schema(
  {
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    email: { type: String, required: true },

    role: {                // ✅ ADD THIS
      type: String,
      default: "admin"
    },

    otpHash: String,
    otpExpiry: Date
  },
  { timestamps: true }
);

export default mongoose.model<IAdmin>("Admin", AdminSchema);
