import mongoose, { Schema, Document } from "mongoose";

export interface IDownload extends Document {
  anime: string;
  season: number;
  episode: number;
  host: string;
  quality: string;
  link: string;
}

const DownloadSchema = new Schema<IDownload>(
  {
    anime: { type: String, required: true },
    season: { type: Number, required: true },
    episode: { type: Number, required: true },
    host: { type: String, required: true },
    quality: { type: String, required: true },
    link: { type: String, required: true }
  },
  { timestamps: true }
);

export default mongoose.model<IDownload>("Download", DownloadSchema);
