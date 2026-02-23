import mongoose, { Schema, Document } from "mongoose";

export interface ISystem extends Document {
  status: "live" | "frozen" | "shutdown";
  config: any;
  killed: boolean;

  versions: {
    name: string;
    createdAt: Date;
  }[];

  backups: {
    name: string;
    createdAt: Date;
  }[];
}

const SystemSchema = new Schema<ISystem>(
  {
    status: {
      type: String,
      enum: ["live", "frozen", "shutdown"],
      default: "live",
    },

    config: {
      type: Schema.Types.Mixed,
      default: {},
    },

    killed: {
      type: Boolean,
      default: false,
    },

    versions: [
      {
        name: String,
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    backups: [
      {
        name: String,
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model<ISystem>("System", SystemSchema);
