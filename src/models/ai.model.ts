import mongoose, { Schema, Document } from "mongoose";

export interface IAI extends Document {
  paused: boolean;

  autoServer: any;
  autoPlayer: any;
  autoAnalytics: any;
  autoBackup: any;
  autoDeploy: any;
  autoCategory: any;
  autoBanner: any;
  autoHomepage: any;
  autoSearch: any;
  autoSEO: any;
  autoDownload: any;
}

const AISchema = new Schema<IAI>(
  {
    paused: { type: Boolean, default: false },

    autoServer: { type: Object, default: {} },
    autoPlayer: { type: Object, default: {} },
    autoAnalytics: { type: Object, default: {} },
    autoBackup: { type: Object, default: {} },
    autoDeploy: { type: Object, default: {} },
    autoCategory: { type: Object, default: {} },
    autoBanner: { type: Object, default: {} },
    autoHomepage: { type: Object, default: {} },
    autoSearch: { type: Object, default: {} },
    autoSEO: { type: Object, default: {} },
    autoDownload: { type: Object, default: {} }
  },
  { timestamps: true }
);

export default mongoose.model<IAI>("AI", AISchema);
