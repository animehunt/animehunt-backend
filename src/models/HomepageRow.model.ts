import mongoose, { Schema, Document } from "mongoose";

export interface IHomepageRow extends Document {
  title: string;
  type: "auto" | "manual" | "category";
  source?: string;
  layout: "scroll" | "grid" | "slider";
  limit: number;
  order: number;
  active: boolean;
  autoUpdate: boolean;
  createdAt: Date;
}

const HomepageRowSchema = new Schema<IHomepageRow>(
  {
    title: { type: String, required: true },
    type: {
      type: String,
      enum: ["auto", "manual", "category"],
      default: "auto"
    },
    source: String,
    layout: {
      type: String,
      enum: ["scroll", "grid", "slider"],
      default: "scroll"
    },
    limit: { type: Number, default: 10 },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    autoUpdate: { type: Boolean, default: false }
  },
  { timestamps: true }
);

/* Performance index */
HomepageRowSchema.index({ order: 1 });
HomepageRowSchema.index({ active: 1 });

export default mongoose.model<IHomepageRow>(
  "HomepageRow",
  HomepageRowSchema
);
