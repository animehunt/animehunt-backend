import mongoose, { Schema, Document } from "mongoose";

export interface IServer extends Document {
  name: string;
  anime: string;
  season: number;
  episode: number;
  embed: string;
  priority: number;
  active: boolean;
}

const ServerSchema = new Schema(
  {
    name: { type: String, required: true },
    anime: { type: String, required: true },
    season: { type: Number, required: true },
    episode: { type: Number, required: true },
    embed: { type: String, required: true },
    priority: { type: Number, default: 1 },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

/* 🔥 Fast queries for player */
ServerSchema.index({ anime: 1, season: 1, episode: 1 });

export default mongoose.model<IServer>("Server", ServerSchema);
