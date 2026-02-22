import mongoose, { Schema, Document } from "mongoose";

export interface ISidebar extends Document {
  title: string;
  icon?: string;
  url: string;
  device: string;
  visibility: string;
  highlight: string;
  badge?: string;
  priority: number;
  active: boolean;
  newTab: boolean;
}

const SidebarSchema = new Schema(
  {
    title: { type: String, required: true },
    icon: String,
    url: { type: String, required: true },
    device: { type: String, default: "All" },
    visibility: { type: String, default: "All" },
    highlight: { type: String, default: "None" },
    badge: String,
    priority: { type: Number, default: 99 },
    active: { type: Boolean, default: true },
    newTab: { type: Boolean, default: false }
  },
  { timestamps: true }
);

/* ⚡ Fast sort */
SidebarSchema.index({ priority: 1 });

export default mongoose.model<ISidebar>("Sidebar", SidebarSchema);
