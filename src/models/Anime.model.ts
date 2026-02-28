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
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },

    type: {
      type: String,
      enum: ["anime", "movie", "series", "cartoon"],
      required: true
    },

    status: {
      type: String,
      enum: ["ongoing", "completed"],
      required: true
    },

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

// ❗ slug index already unique है इसलिए दुबारा index नहीं लगाना
AnimeSchema.index({ type: 1 });
AnimeSchema.index({ status: 1 });

export default mongoose.model<IAnime>("Anime", AnimeSchema);
