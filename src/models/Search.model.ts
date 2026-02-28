import mongoose, { Schema, Document } from "mongoose";

export interface ISearch extends Document {
  enableSearch: boolean;
  liveSearch: boolean;
  mode: "instant" | "debounce";
  debounce: number;

  ranking: {
    mode: "smart" | "views" | "latest" | "alphabetical";
    boost: boolean;
    weight: number;
  };

  sources: {
    anime: boolean;
    episode: boolean;
    category: boolean;
    pages: boolean;
  };

  smart: {
    typo: boolean;
    alias: boolean;
    language: "all" | "hindi" | "english";
  };

  ui: {
    max: number;
    thumb: boolean;
    group: boolean;
    highlight: boolean;
  };

  safety: {
    safe: "strict" | "medium" | "off";
    track: boolean;
    seo: boolean;
    cache: number;
  };
}

const SearchSchema = new Schema<ISearch>(
  {
    enableSearch: { type: Boolean, default: true },
    liveSearch: { type: Boolean, default: true },
    mode: { type: String, enum: ["instant", "debounce"], default: "instant" },
    debounce: { type: Number, default: 300 },

    ranking: {
      mode: {
        type: String,
        enum: ["smart", "views", "latest", "alphabetical"],
        default: "smart"
      },
      boost: { type: Boolean, default: true },
      weight: { type: Number, min: 1, max: 10, default: 5 }
    },

    sources: {
      anime: { type: Boolean, default: true },
      episode: { type: Boolean, default: true },
      category: { type: Boolean, default: false },
      pages: { type: Boolean, default: false }
    },

    smart: {
      typo: { type: Boolean, default: true },
      alias: { type: Boolean, default: true },
      language: {
        type: String,
        enum: ["all", "hindi", "english"],
        default: "all"
      }
    },

    ui: {
      max: { type: Number, min: 1, max: 50, default: 8 },
      thumb: { type: Boolean, default: true },
      group: { type: Boolean, default: false },
      highlight: { type: Boolean, default: true }
    },

    safety: {
      safe: {
        type: String,
        enum: ["strict", "medium", "off"],
        default: "medium"
      },
      track: { type: Boolean, default: true },
      seo: { type: Boolean, default: true },
      cache: { type: Number, min: 0, max: 600, default: 60 }
    }
  },
  { timestamps: true }
);

export default mongoose.model<ISearch>("Search", SearchSchema);
