import mongoose, { Schema, Document } from "mongoose";

export interface IDeploy extends Document {
  frozen: boolean;
  emergency: boolean;
  versions: {
    name: string;
    date: string;
  }[];
  backups: {
    id: string;
    name: string;
    date: string;
  }[];
}

const DeploySchema = new Schema<IDeploy>(
  {
    frozen: { type: Boolean, default: false },
    emergency: { type: Boolean, default: false },

    versions: [
      {
        name: String,
        date: String
      }
    ],

    backups: [
      {
        id: String,
        name: String,
        date: String
      }
    ]
  },
  { timestamps: true }
);

export default mongoose.model<IDeploy>("Deploy", DeploySchema);
