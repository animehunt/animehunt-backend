import mongoose, { Schema, Document } from "mongoose";

export interface IAnalytics extends Document {
  type: string;
  animeSlug?: string;
  episodeId?: string;
  category?: string;
  bannerId?: string;
  server?: string;
  searchQuery?: string;
  createdAt: Date;
}

const AnalyticsSchema = new Schema<IAnalytics>(
  {
    type: { type: String, required: true }, // visit, pageView, animeView, episodeView, download, search
    animeSlug: String,
    episodeId: String,
    category: String,
    bannerId: String,
    server: String,
    searchQuery: String
  },
  { timestamps: true }
);

export default mongoose.model<IAnalytics>("Analytics", AnalyticsSchema);
