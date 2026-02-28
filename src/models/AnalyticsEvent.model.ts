import mongoose, { Schema, Document } from "mongoose";

export interface IAnalyticsEvent extends Document {
  type:
    | "VISITOR"
    | "PAGE_VIEW"
    | "ANIME_VIEW"
    | "EPISODE_VIEW"
    | "DOWNLOAD"
    | "SEARCH"
    | "BANNER_CLICK"
    | "SERVER_VIEW";

  animeSlug?: string;
  episodeId?: string;
  category?: string;
  banner?: string;
  server?: string;
  query?: string;

  createdAt: Date;
}

const AnalyticsSchema = new Schema<IAnalyticsEvent>(
  {
    type: { type: String, required: true },
    animeSlug: String,
    episodeId: String,
    category: String,
    banner: String,
    server: String,
    query: String
  },
  { timestamps: true }
);

export default mongoose.model<IAnalyticsEvent>(
  "AnalyticsEvent",
  AnalyticsSchema
);
