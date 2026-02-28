import mongoose, { Document, Schema } from "mongoose";

export interface IAd extends Document {
  name: string;
  type: string;
  adCode: string;
  page: string;
  position: string;
  maxPerPage: number;
  startDate?: Date;
  endDate?: Date;
  priority: number;
  animeSlug?: string;
  episode?: string;
  country?: string;
  language?: string;
  maxViews?: number;
  status: "ON" | "OFF";
  createdAt: Date;
}

const AdSchema = new Schema<IAd>(
  {
    name: { type: String, required: true },
    type: { type: String, required: true },
    adCode: { type: String, required: true },
    page: { type: String, required: true },
    position: { type: String, required: true },
    maxPerPage: { type: Number, default: 1 },
    startDate: Date,
    endDate: Date,
    priority: { type: Number, default: 5 },
    animeSlug: String,
    episode: String,
    country: String,
    language: String,
    maxViews: Number,
    status: { type: String, enum: ["ON", "OFF"], default: "ON" }
  },
  { timestamps: true }
);

export default mongoose.model<IAd>("Ad", AdSchema);
