import mongoose, { Schema, Document } from "mongoose";

export interface ISEO extends Document {
  global: {
    title: string;
    desc: string;
    keywords: string;
    canonical: string;
    indexing: "index" | "noindex";
  };

  home: {
    title: string;
    desc: string;
    keywords: string;
    og: string;
  };

  templates: {
    anime: string;
    category: string;
    episode: string;
    search: string;
  };

  social: {
    ogTitle: string;
    ogDesc: string;
    twTitle: string;
    twDesc: string;
    twCard: string;
  };
}

const SEOSchema = new Schema<ISEO>(
  {
    global: {
      title: { type: String, default: "" },
      desc: { type: String, default: "" },
      keywords: { type: String, default: "" },
      canonical: { type: String, default: "" },
      indexing: { type: String, enum: ["index", "noindex"], default: "index" }
    },

    home: {
      title: { type: String, default: "" },
      desc: { type: String, default: "" },
      keywords: { type: String, default: "" },
      og: { type: String, default: "" }
    },

    templates: {
      anime: { type: String, default: "" },
      category: { type: String, default: "" },
      episode: { type: String, default: "" },
      search: { type: String, default: "" }
    },

    social: {
      ogTitle: { type: String, default: "" },
      ogDesc: { type: String, default: "" },
      twTitle: { type: String, default: "" },
      twDesc: { type: String, default: "" },
      twCard: { type: String, default: "summary_large_image" }
    }
  },
  { timestamps: true }
);

export default mongoose.model<ISEO>("SEO", SEOSchema);
