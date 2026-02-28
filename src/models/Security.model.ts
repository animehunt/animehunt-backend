import mongoose, { Schema, Document } from "mongoose";

export interface ISecurity extends Document {
  ultra: boolean;
  firewallLevel: number;

  geo: {
    indiaOnly: boolean;
    blockForeign: boolean;
    blockedCountries: string[];
  };

  admin: {
    loginLimit: boolean;
    deviceLock: boolean;
    sessionMonitor: boolean;
  };

  ai: {
    autoBan: boolean;
    brute: boolean;
    bot: boolean;
    learning: boolean;
  };

  system: {
    hideServer: boolean;
    hideTech: boolean;
  };
}

const SecuritySchema = new Schema<ISecurity>(
  {
    ultra: { type: Boolean, default: false },
    firewallLevel: { type: Number, min: 1, max: 5, default: 3 },

    geo: {
      indiaOnly: { type: Boolean, default: false },
      blockForeign: { type: Boolean, default: false },
      blockedCountries: { type: [String], default: [] }
    },

    admin: {
      loginLimit: { type: Boolean, default: true },
      deviceLock: { type: Boolean, default: false },
      sessionMonitor: { type: Boolean, default: true }
    },

    ai: {
      autoBan: { type: Boolean, default: true },
      brute: { type: Boolean, default: true },
      bot: { type: Boolean, default: true },
      learning: { type: Boolean, default: false }
    },

    system: {
      hideServer: { type: Boolean, default: true },
      hideTech: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

export default mongoose.model<ISecurity>("Security", SecuritySchema);
