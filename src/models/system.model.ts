import mongoose, { Schema, Document } from "mongoose";

export interface ISystem extends Document {
  status: string;
  versions: { name: string; createdAt: Date }[];
  backups: { name: string; createdAt: Date }[];
}

const SystemSchema = new Schema<ISystem>(
  {
    status: { type: String, default: "live" }, // live, frozen, shutdown
    versions: [
      {
        name: String,
        createdAt: { type: Date, default: Date.now }
      }
    ],
    backups: [
      {
        name: String,
        createdAt: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

export default mongoose.model<ISystem>("System", SystemSchema);
