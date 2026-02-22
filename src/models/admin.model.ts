import mongoose, { Schema, Document } from "mongoose";

export interface IAdmin extends Document {
  username: string;
  password: string;
  email: string;
  otpHash?: string;
  otpExpiry?: Date;
}

const AdminSchema = new Schema(
  {
    username: { type: String, unique: true },
    password: String,
    email: String,
    otpHash: String,
    otpExpiry: Date
  },
  { timestamps: true }
);

export default mongoose.model<IAdmin>("Admin", AdminSchema);
