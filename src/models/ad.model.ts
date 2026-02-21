import mongoose, { Schema, Document } from "mongoose";

export interface IAd extends Document {
  name: string;
  type: "Banner" | "Video" | "Native";
  adCode: string;

  page: "Home" | "Watch";
  position: "Header" | "Player";
  maxPerPage: number;

  startDate?: Date;
  endDate?: Date;
  priority: number;

  animeSlug?: string;
  episode?: number;
  applyAllEpisodes: boolean;

  mobileOnly: boolean;
  desktopOnly: boolean;
  premiumAdFree: boolean;

  country?: string;
  language: string;

  maxViews?: number;
  smartRotation: boolean;
  abTesting: boolean;

  status: "ON" | "OFF";
  views: number;
}

const AdSchema = new Schema<IAd>(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ["Banner", "Video", "Native"], required: true },
    adCode: { type: String, required: true },

    page: { type: String, enum: ["Home", "Watch"], required: true },
    position: { type: String, enum: ["Header", "Player"], required: true },
    maxPerPage: { type: Number, default: 1 },

    startDate: Date,
    endDate: Date,
    priority: { type: Number, default: 5 },

    animeSlug: String,
    episode: Number,
    applyAllEpisodes: { type: Boolean, default: false },

    mobileOnly: { type: Boolean, default: false },
    desktopOnly: { type: Boolean, default: false },
    premiumAdFree: { type: Boolean, default: true },

    country: String,
    language: { type: String, default: "All Languages" },

    maxViews: Number,
    smartRotation: { type: Boolean, default: false },
    abTesting: { type: Boolean, default: false },

    status: { type: String, enum: ["ON", "OFF"], default: "ON" },
    views: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export default mongoose.model<IAd>("Ad", AdSchema);
