import mongoose, { Schema, Document } from "mongoose";

export interface ISystem extends Document {
  config: Record<string, any>;
  killed: boolean;
}

const SystemSchema = new Schema(
  {
    config: {
      type: Schema.Types.Mixed,
      default: {}
    },
    killed: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

export default mongoose.model<ISystem>("System", SystemSchema);
