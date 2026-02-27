import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import mongoSanitize from "mongo-sanitize";
import mongoose from "mongoose";

/* ===============================
   ROUTES IMPORT
================================ */
import Admin from "./models/admin.model";
import adRoutes from "./routes/ad.routes";
import aiRoutes from "./routes/ai.routes";
import analyticsRoutes from "./routes/analytics.routes";
import animeRoutes from "./routes/anime.routes";
import bannerRoutes from "./routes/banner.routes";
import downloadRoutes from "./routes/download.routes";
import episodeRoutes from "./routes/episode.routes";
import homepageRoutes from "./routes/homepage.routes";

import authRoutes from "./routes/auth.routes";

import performanceRoutes from "./routes/performance.routes";
import playerRoutes from "./routes/player.routes";
import searchRoutes from "./routes/search.routes";
import securityRoutes from "./routes/security.routes";
import seoRoutes from "./routes/seo.routes";
import serverRoutes from "./routes/server.routes";
import sidebarRoutes from "./routes/sidebar.routes";
import footerRoutes from "./routes/footer.routes";
import systemRoutes from "./routes/system.routes";

/* ===============================
   MIDDLEWARE IMPORT
================================ */

import { verifyAdmin } from "./middleware/auth.middleware";
import { systemGuard } from "./middleware/systemsettings.guard";
import { apiLimiter } from "./middleware/rateLimit.middleware";
import { errorHandler } from "./middleware/error.middleware";

dotenv.config();

const app = express();

/* ======================================================
   TRUST PROXY (Cloudflare + Render Required)
====================================================== */
app.set("trust proxy", 1);

/* ======================================================
   GLOBAL SECURITY MIDDLEWARES
====================================================== */

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

/* ================= CORS ================= */

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      const allowedEnvOrigins =
        process.env.ALLOWED_ORIGINS?.split(",") || [];

      const isCloudflarePreview =
        origin.endsWith(".pages.dev");

      const isAllowedEnv =
        allowedEnvOrigins.includes(origin);

      if (isCloudflarePreview || isAllowedEnv) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PATCH", "DELETE"],
    credentials: true,
  })
);

/* ================= BODY PARSER ================= */

app.use(express.json({ limit: "10kb" }));

/* ================= RATE LIMIT ================= */

app.use("/api", apiLimiter);

/* ================= MONGO SANITIZE ================= */

app.use((req, _res, next) => {
  if (req.body) {
    req.body = mongoSanitize(req.body);
  }
  next();
});

/* ======================================================
   DATABASE CONNECTION
====================================================== */

mongoose.set("strictQuery", true);

mongoose
  .connect(process.env.MONGO_URI as string)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ Database Error:", err);
    process.exit(1);
  });

/* ======================================================
   ROUTES STRUCTURE
====================================================== */

/* Health Check */
app.get("/", (_req, res) => {
  res.json({
    status: "AnimeHunt Backend Running 🚀",
    environment: process.env.NODE_ENV,
  });
});

/* =======================
   AUTH (UNPROTECTED)
======================= */
app.use("/api/auth", authRoutes);

/* =======================
   PUBLIC ROUTES
======================= */
app.use("/api/ads", adRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/anime", animeRoutes);
app.use("/api", bannerRoutes);
app.use("/api", analyticsRoutes);
app.use("/api", downloadRoutes);
app.use("/api", episodeRoutes);
app.use("/api", homepageRoutes);

/* =======================
   SYSTEM GUARD
======================= */
app.use(systemGuard);

/* =======================
   ADMIN ROUTES (PROTECTED)
======================= */
app.use("/api/admin", verifyAdmin);

app.use("/api/admin", performanceRoutes);
app.use("/api/admin", playerRoutes);
app.use("/api/admin", searchRoutes);
app.use("/api/admin", securityRoutes);
app.use("/api/admin", seoRoutes);
app.use("/api/admin", serverRoutes);
app.use("/api/admin", sidebarRoutes);
app.use("/api/admin", footerRoutes);
app.use("/api/admin", systemRoutes);

/* ======================================================
   GLOBAL ERROR HANDLER
====================================================== */

app.use(errorHandler);

/* ======================================================
   GRACEFUL SHUTDOWN (Production Safe)
====================================================== */

process.on("unhandledRejection", (err: any) => {
  console.error("🔥 Unhandled Rejection:", err);
  process.exit(1);
});

process.on("uncaughtException", (err: any) => {
  console.error("🔥 Uncaught Exception:", err);
  process.exit(1);
});

/* ======================================================
   START SERVER
====================================================== */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
app.get("/create-admin-now", async (req, res) => {
  try {
    await Admin.create({
      username: "anime_moderator_007",
      password: "$2a$12$nBnUbK5MKK7ca10EJgHQqeNLaUBWPFGphsiTYuENXXTxjyT3dt4LK",
      email: "nakulmalviya256@gmail.com",   // required field
      role: "admin"
    });

    res.send("Admin Created Successfully ✅");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error creating admin");
  }
});
