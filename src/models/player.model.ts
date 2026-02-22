import mongoose, { Schema, Document } from "mongoose";

export interface IPlayer extends Document {
  defaultServer: string;
  autoplay: boolean;
  resume: boolean;
  autoswitch: boolean;
  mode: string;
  ui: {
    servers: boolean;
    download: boolean;
    subscribe: boolean;
    related: boolean;
  };
}

const PlayerSchema = new Schema(
  {
    defaultServer: { type: String, default: "Server 1" },
    autoplay: { type: Boolean, default: true },
    resume: { type: Boolean, default: true },
    autoswitch: { type: Boolean, default: true },
    mode: { type: String, default: "responsive" },
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
