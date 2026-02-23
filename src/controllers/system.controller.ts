import mongoose, { Schema, Document } from "mongoose";

export interface ISystem extends Document {
  status: string;
  versions: {
    name: string;
    createdAt: Date;
  }[];
  backups: {
    name: string;
    createdAt: Date;
  }[];
}

const SystemSchema = new Schema(
  {
    status: {
      type: String,
      default: "live"
    },
    versions: [
      {
        name: String,
        createdAt: Date
      }
    ],
    backups: [
      {
        name: String,
        createdAt: Date
      }
    ]
  },
  { timestamps: true }
);

export default mongoose.model<ISystem>("System", SystemSchema);
