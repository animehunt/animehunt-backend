import mongoose, { Schema, Document } from "mongoose";

export interface IDownload extends Document {
  anime: string;
  season: string;
  episode: string;
  host: string;
  quality: string;
  link: string;
  createdAt: Date;
}

const DownloadSchema = new Schema<IDownload>(
  {
    anime: { type: String, required: true },
    season: { type: String, required: true },
    episode: { type: String, required: true },
    host: { type: String, required: true },
    quality: { type: String, required: true },
    link: { type: String, required: true }
  },
  { timestamps: true }
);

/* Performance Index */
DownloadSchema.index({ anime: 1 });
DownloadSchema.index({ season: 1 });
DownloadSchema.index({ episode: 1 });

export default mongoose.model<IDownload>("Download", DownloadSchema);
