import mongoose, { Schema, Document } from "mongoose";

export interface IPlayer extends Document {
  defaultServer: string;
  autoplay: boolean;
  resume: boolean;
  autoswitch: boolean;
  mode: "responsive" | "fixed";
  ui: {
    servers: boolean;
    download: boolean;
    subscribe: boolean;
    related: boolean;
  };
  updatedAt: Date;
}

const PlayerSchema = new Schema<IPlayer>(
  {
    defaultServer: { type: String, default: "Server 1" },
    autoplay: { type: Boolean, default: false },
    resume: { type: Boolean, default: true },
    autoswitch: { type: Boolean, default: true },
    mode: { type: String, enum: ["responsive", "fixed"], default: "responsive" },
    ui: {
      servers: { type: Boolean, default: true },
      download: { type: Boolean, default: true },
      subscribe: { type: Boolean, default: false },
      related: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

export default mongoose.model<IPlayer>("Player", PlayerSchema);
