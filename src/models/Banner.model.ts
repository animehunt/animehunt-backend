import mongoose, { Schema, Document } from "mongoose";

export interface IBanner extends Document {
  title: string;
  image: string;
  type: string;
  target?: string;
  position?: string;
  order: number;
  device: "all" | "mobile" | "desktop";
  active: boolean;
  autoRotate: boolean;
  createdAt: Date;
}

const BannerSchema = new Schema<IBanner>(
  {
    title: { type: String, required: true },
    image: { type: String, required: true },
    type: { type: String, required: true },
    target: String,
    position: String,
    order: { type: Number, default: 0 },
    device: { type: String, default: "all" },
    active: { type: Boolean, default: false },
    autoRotate: { type: Boolean, default: false }
  },
  { timestamps: true }
);

BannerSchema.index({ order: 1 });
BannerSchema.index({ active: 1 });
BannerSchema.index({ device: 1 });

export default mongoose.model<IBanner>("Banner", BannerSchema);
