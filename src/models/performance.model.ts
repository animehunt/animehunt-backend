import mongoose, { Schema, Document } from "mongoose";

export interface IPerformance extends Document {
  [key: string]: any;
}

const PerformanceSchema = new Schema(
  {},
  { strict: false, timestamps: true }
);

export default mongoose.model<IPerformance>(
  "Performance",
  PerformanceSchema
);
