import mongoose, { Schema, Document } from "mongoose";

export interface ISEO extends Document {
  global: any;
  home: any;
  templates: any;
  social: any;
}

const SEOSchema = new Schema(
  {
    global: {
      title: String,
      desc: String,
      keywords: String,
      canonical: String,
      indexing: { type: String, default: "index" }
    },
    home: {
      title: String,
      desc: String,
      keywords: String,
      og: String
    },
    templates: {
      anime: String,
      category: String,
      episode: String,
      search: String
    },
    social: {
      ogTitle: String,
      ogDesc: String,
      twTitle: String,
      twDesc: String,
      twCard: { type: String, default: "summary_large_image" }
    }
  },
  { timestamps: true }
);

export default mongoose.model<ISEO>("SEO", SEOSchema);
