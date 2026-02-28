import mongoose, { Schema, Document } from "mongoose";

export interface IFooter extends Document {
  footerOn: boolean;
  footerLazy: boolean;
  footerBlur: boolean;
  footerLock: boolean;
  footerTheme: string;

  about: boolean;
  privacy: boolean;
  disclaimer: boolean;
  dmca: boolean;
  telegram: boolean;
  linkBadges: boolean;

  azOn: boolean;
  azAuto: boolean;
  azSticky: boolean;
  azCompact: boolean;
  azMode: string;

  mobileNav: boolean;
  mobileFloat: boolean;
  mobileBlur: boolean;
  mobileHideScroll: boolean;

  promoOn: boolean;
  promoText: string;
  promoLink: string;
  promoAutoHide: boolean;
}

const FooterSchema = new Schema<IFooter>(
  {
    footerOn: { type: Boolean, default: true },
    footerLazy: { type: Boolean, default: false },
    footerBlur: { type: Boolean, default: false },
    footerLock: { type: Boolean, default: false },
    footerTheme: { type: String, default: "Dark" },

    about: { type: Boolean, default: true },
    privacy: { type: Boolean, default: true },
    disclaimer: { type: Boolean, default: true },
    dmca: { type: Boolean, default: true },
    telegram: { type: Boolean, default: true },
    linkBadges: { type: Boolean, default: false },

    azOn: { type: Boolean, default: true },
    azAuto: { type: Boolean, default: true },
    azSticky: { type: Boolean, default: false },
    azCompact: { type: Boolean, default: false },
    azMode: { type: String, default: "Scroll" },

    mobileNav: { type: Boolean, default: true },
    mobileFloat: { type: Boolean, default: false },
    mobileBlur: { type: Boolean, default: false },
    mobileHideScroll: { type: Boolean, default: false },

    promoOn: { type: Boolean, default: false },
    promoText: { type: String, default: "" },
    promoLink: { type: String, default: "" },
    promoAutoHide: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.model<IFooter>("Footer", FooterSchema);
