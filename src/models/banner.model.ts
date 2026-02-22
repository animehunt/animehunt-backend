import mongoose, { Schema, Document } from "mongoose";

export interface IBanner extends Document {
  title: string;
  image: string;
  type: string;
  target: string;
  position: string;
  order: number;
  device: string;
  active: boolean;
  autoRotate: boolean;
}

const BannerSchema = new Schema<IBanner>(
  {
    title: { type: String, required: true },
    image: { type: String, required: true },
    type: String,
    target: String,
    position: String,
    order: { type: Number, default: 0 },
    device: { type: String, default: "all" },
    active: { type: Boolean, default: false },
    autoRotate: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.model<IBanner>("Banner", BannerSchema);
