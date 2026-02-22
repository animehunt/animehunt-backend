import mongoose, { Schema, Document } from "mongoose";

export interface ICategory extends Document {
  name: string;
  slug: string;
  type: string;
  order: number;
  priority: number;
  showHome: boolean;
  active: boolean;
  featured: boolean;
  aiTrending: boolean;
  aiPopular: boolean;
  aiAssign: boolean;
}

const CategorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    type: { type: String, default: "row" },
    order: { type: Number, default: 0 },
    priority: { type: Number, default: 1 },
    showHome: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    featured: { type: Boolean, default: false },
    aiTrending: { type: Boolean, default: false },
    aiPopular: { type: Boolean, default: false },
    aiAssign: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.model<ICategory>("Category", CategorySchema);
