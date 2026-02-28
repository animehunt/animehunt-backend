import mongoose, { Schema, Document } from "mongoose";

export interface IServer extends Document {
  name: string;
  anime: string;
  season: string;
  episode: string;
  embed: string;
  priority: number;
  active: boolean;
}

const ServerSchema = new Schema<IServer>(
  {
    name: { type: String, required: true },
    anime: { type: String, required: true },
    season: { type: String, default: "" },
    episode: { type: String, default: "" },
    embed: { type: String, default: "" },
    priority: { type: Number, default: 99 },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

/* Optional Index for faster episode lookup */
ServerSchema.index({ anime: 1, season: 1, episode: 1 });

export default mongoose.model<IServer>("Server", ServerSchema);
