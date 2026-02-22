import mongoose, { Schema, Document } from "mongoose";

interface IQualityLink {
  quality: string;
  url: string;
}

interface IDownloadHost {
  host: string;
  links: IQualityLink[];
}

export interface IEpisode extends Document {
  anime: string;
  season: number;
  episode: number;
  title: string;
  description: string;
  servers: string[];
  downloads: IDownloadHost[];
  ongoing: boolean;
  featured: boolean;
}

const QualitySchema = new Schema<IQualityLink>({
  quality: String,
  url: String
});

const DownloadHostSchema = new Schema<IDownloadHost>({
  host: String,
  links: [QualitySchema]
});

const EpisodeSchema = new Schema<IEpisode>(
  {
    anime: { type: String, required: true },
    season: { type: Number, required: true },
    episode: { type: Number, required: true },
    title: String,
    description: String,
    servers: [String],
    downloads: [DownloadHostSchema],
    ongoing: { type: Boolean, default: false },
    featured: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.model<IEpisode>("Episode", EpisodeSchema);
