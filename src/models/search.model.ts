import mongoose, { Schema, Document } from "mongoose";

export interface ISearch extends Document {
  [key: string]: any;
}

const SearchSchema = new Schema(
  {},
  { strict: false, timestamps: true }
);

export default mongoose.model<ISearch>("Search", SearchSchema);
