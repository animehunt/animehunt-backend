import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoSanitize from "mongo-sanitize";
import mongoose from "mongoose";

/* ===============================
   ROUTES IMPORT
================================ */

import adRoutes from "./routes/ad.routes";
import aiRoutes from "./routes/ai.routes";
import analyticsRoutes from "./routes/analytics.routes";
import animeRoutes from "./routes/anime.routes";
import bannerRoutes from "./routes/banner.routes";
import categoryRoutes from "./routes/category.routes";
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
import { systemGuard } from "./middleware/system.guard";

dotenv.config();

const app = express();

/* ======================================================
   GLOBAL SECURITY MIDDLEWARES
====================================================== */

app.use(helmet());

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      const allowedEnvOrigins =
        process.env.ALLOWED_ORIGINS?.split(",") || [];

      const isCloudflarePreview =
        origin?.endsWith(".pages.dev");

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

app.use(express.json({ limit: "10kb" }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

app.use((req, _res, next) => {
  if (req.body) {
    req.body = mongoSanitize(req.body);
  }
  next();
});

/* ======================================================
   DATABASE CONNECTION
====================================================== */

mongoose
  .connect(process.env.MONGO_URI as string)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ Database Error:", err);
    process.exit(1);
  });

/* ======================================================
   ROUTES STRUCTURE (PRODUCTION SAFE)
====================================================== */

// Health Check
app.get("/", (_req, res) => {
  res.json({ status: "AnimeHunt Backend Running 🚀" });
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
app.use("/api", categoryRoutes);
app.use("/api", analyticsRoutes);
app.use("/api", downloadRoutes);
app.use("/api", episodeRoutes);
app.use("/api", homepageRoutes);

/* =======================
   SYSTEM GUARD
   (Blocks public during kill/maintenance)
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

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("🔥 Error:", err.message);

  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "CORS Blocked",
    });
  }

  res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
});

/* ======================================================
   START SERVER
====================================================== */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
