import mongoose, { Schema, Document } from "mongoose";

export interface ISidebar extends Document {
  title: string;
  icon: string;
  url: string;
  device: "All" | "Desktop" | "Mobile";
  visibility: "All" | "Logged Users" | "Guests";
  highlight: "None" | "NEW" | "HOT" | "UPDATE";
  badge: string;
  priority: number;
  active: boolean;
  newTab: boolean;
}

const SidebarSchema = new Schema<ISidebar>(
  {
    title: { type: String, required: true },
    icon: { type: String, default: "" },
    url: { type: String, required: true },
    device: {
      type: String,
      enum: ["All", "Desktop", "Mobile"],
      default: "All"
    },
    visibility: {
      type: String,
      enum: ["All", "Logged Users", "Guests"],
      default: "All"
    },
    highlight: {
      type: String,
      enum: ["None", "NEW", "HOT", "UPDATE"],
      default: "None"
    },
    badge: { type: String, default: "" },
    priority: { type: Number, default: 99 },
    active: { type: Boolean, default: true },
    newTab: { type: Boolean, default: false }
  },
  { timestamps: true }
);

/* Sorting Index */
SidebarSchema.index({ priority: 1 });

export default mongoose.model<ISidebar>("Sidebar", SidebarSchema);
