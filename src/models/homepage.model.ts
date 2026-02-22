import mongoose, { Schema, Document } from "mongoose";

export interface IHomepageRow extends Document {
  title: string;
  type: string;        // auto | manual | category
  source: string;      // category name / tag / manual list
  layout: string;      // scroll | grid | slider
  limit: number;
  order: number;
  active: boolean;
  autoUpdate: boolean;
}

const HomepageRowSchema = new Schema<IHomepageRow>(
  {
    title: { type: String, required: true },
    type: { type: String, default: "auto" },
    source: String,
    layout: { type: String, default: "scroll" },
    limit: { type: Number, default: 10 },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    autoUpdate: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.model<IHomepageRow>("HomepageRow", HomepageRowSchema);
