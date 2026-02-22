import mongoose, { Schema, Document } from "mongoose";

export interface IFooter extends Document {
  [key: string]: any;
}

const FooterSchema = new Schema(
  {},
  { strict: false, timestamps: true } // dynamic keys allow full flexibility
);

export default mongoose.model<IFooter>("Footer", FooterSchema);
