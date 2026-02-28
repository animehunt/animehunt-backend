import mongoose, { Schema, Document } from "mongoose";

export interface ISystem extends Document {
  config: Record<string, any>;
  killed: boolean;
}

const SystemSchema = new Schema<ISystem>(
  {
    config: {
      type: Object,
      default: {}
    },
    killed: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

/* Ensure only ONE document exists */
SystemSchema.index({}, { unique: false });

export default mongoose.model<ISystem>("System", SystemSchema);
