import mongoose, { Schema, Document } from "mongoose";

interface IQuality {
  quality: string;
  url: string;
}

interface IDownloadHost {
  host: string;
  links: IQuality[];
}

export interface IEpisode extends Document {
  anime: string;
  season: string;
  episode: string;
  title: string;
  description?: string;

  servers: string[];

  downloads: IDownloadHost[];

  ongoing: boolean;
  featured: boolean;

  createdAt: Date;
}

const QualitySchema = new Schema<IQuality>({
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
    season: { type: String, required: true },
    episode: { type: String, required: true },
    title: { type: String, required: true },
    description: String,

    servers: [String],

    downloads: [DownloadHostSchema],

    ongoing: { type: Boolean, default: false },
    featured: { type: Boolean, default: false }
  },
  { timestamps: true }
);

/* Performance Index */
EpisodeSchema.index({ anime: 1 });
EpisodeSchema.index({ season: 1 });
EpisodeSchema.index({ episode: 1 });

export default mongoose.model<IEpisode>("Episode", EpisodeSchema);
