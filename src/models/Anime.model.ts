import mongoose, { Schema, Document } from "mongoose";

export interface IAnime extends Document {
  title: string;
  slug: string;
  type: "anime" | "movie" | "series" | "cartoon";
  status: "ongoing" | "completed";

  poster?: string;
  banner?: string;

  year?: string;
  rating?: string;
  language?: string;
  duration?: string;

  categories?: string;
  tags?: string;
  description?: string;

  isHome: boolean;
  isTrending: boolean;
  isMostViewed: boolean;
  isBanner: boolean;

  createdAt: Date;
}

const AnimeSchema = new Schema<IAnime>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true }, // unique already creates index
    type: { type: String, required: true },
    status: { type: String, required: true },

    poster: String,
    banner: String,

    year: String,
    rating: String,
    language: String,
    duration: String,

    categories: String,
    tags: String,
    description: String,

    isHome: { type: Boolean, default: false },
    isTrending: { type: Boolean, default: false },
    isMostViewed: { type: Boolean, default: false },
    isBanner: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// keep these if needed
AnimeSchema.index({ type: 1 });
AnimeSchema.index({ status: 1 });

export default mongoose.model<IAnime>("Anime", AnimeSchema);
