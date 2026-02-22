import mongoose, { Schema, Document } from "mongoose";

export interface IAdmin extends Document {
  username: string;
  password: string;
  role: string;
}

const AdminSchema = new Schema<IAdmin>({
  username: { type: String, unique: true },
  password: String,
  role: { type: String, default: "admin" }
});

export default mongoose.model<IAdmin>("Admin", AdminSchema);
