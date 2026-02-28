import mongoose, { Schema, Document } from "mongoose";

export interface IPerformance extends Document {
  lazyLoad: boolean;
  smartPreload: boolean;
  assetMinify: boolean;
  imgOptimize: boolean;
  jsOptimize: boolean;
  cssOptimize: boolean;
  smartCache: boolean;
  mobilePriority: boolean;
  cdnMode: boolean;
  adaptiveLoad: boolean;
  preconnect: boolean;
  bandwidth: boolean;
  updatedAt: Date;
}

const PerformanceSchema = new Schema<IPerformance>(
  {
    lazyLoad: { type: Boolean, default: true },
    smartPreload: { type: Boolean, default: false },
    assetMinify: { type: Boolean, default: true },
    imgOptimize: { type: Boolean, default: true },
    jsOptimize: { type: Boolean, default: true },
    cssOptimize: { type: Boolean, default: true },
    smartCache: { type: Boolean, default: true },
    mobilePriority: { type: Boolean, default: true },
    cdnMode: { type: Boolean, default: false },
    adaptiveLoad: { type: Boolean, default: false },
    preconnect: { type: Boolean, default: true },
    bandwidth: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.model<IPerformance>(
  "Performance",
  PerformanceSchema
);
