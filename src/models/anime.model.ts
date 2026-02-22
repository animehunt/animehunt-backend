import mongoose, { Schema, Document } from "mongoose";

export interface IAnime extends Document {
  title: string;
  slug: string;
  type: string;
  status: string;
  poster?: string;
  banner?: string;
  year?: string;
  rating?: string;
  language?: string;
  duration?: string;
  categories?: string;
  tags?: string;
  isHome: boolean;
  isTrending: boolean;
  isMostViewed: boolean;
  isBanner: boolean;
  description?: string;
}

const AnimeSchema = new Schema<IAnime>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    type: String,
    status: String,
    poster: String,
    banner: String,
    year: String,
    rating: String,
    language: String,
    duration: String,
    categories: String,
    tags: String,
    isHome: { type: Boolean, default: false },
    isTrending: { type: Boolean, default: false },
    isMostViewed: { type: Boolean, default: false },
    isBanner: { type: Boolean, default: false },
    description: String
  },
  { timestamps: true }
);

export default mongoose.model<IAnime>("Anime", AnimeSchema);
