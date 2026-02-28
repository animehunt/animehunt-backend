import mongoose, { Schema, Document } from "mongoose";

export interface IAiSettings extends Document {
  engines: Record<string, Record<string, boolean>>;
  paused: boolean;
}

const AiSettingsSchema = new Schema<IAiSettings>(
  {
    engines: {
      type: Object,
      default: {}
    },
    paused: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

export default mongoose.model<IAiSettings>(
  "AiSettings",
  AiSettingsSchema
);
