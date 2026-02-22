import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoSanitize from "mongo-sanitize";
import mongoose from "mongoose";

import adRoutes from "./routes/ad.routes";
import aiRoutes from "./routes/ai.routes";
import analyticsRoutes from "./routes/analytics.routes";
import animeRoutes from "./routes/anime.routes";
import bannerRoutes from "./routes/banner.routes";
import categoryRoutes from "./routes/category.routes";
import systemRoutes from "./routes/system.routes";
import downloadRoutes from "./routes/download.routes";
import episodeRoutes from "./routes/episode.routes";
import footerRoutes from "./routes/footer.routes";
import homepageRoutes from "./routes/homepage.routes";
import authRoutes from "./routes/auth.routes";
import { verifyAdmin } from "./middleware/auth.middleware";
import performanceRoutes from "./routes/performance.routes";
import playerRoutes from "./routes/player.routes";
import searchRoutes from "./routes/search.routes";
import securityRoutes from "./routes/security.routes";
import seoRoutes from "./routes/seo.routes";
import serverRoutes from "./routes/server.routes";
import sidebarRoutes from "./routes/sidebar.routes";

dotenv.config();

const app = express();

/* ===============================
   SECURITY MIDDLEWARES
================================ */

app.use(helmet());

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      const allowedEnvOrigins =
        process.env.ALLOWED_ORIGINS?.split(",") || [];

      const isCloudflarePreview = origin.endsWith(".pages.dev");
      const isAllowedEnv = allowedEnvOrigins.includes(origin);

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
  max: 300,
});
app.use(limiter);

app.use((req, res, next) => {
  if (req.body) {
    req.body = mongoSanitize(req.body);
  }
  next();
});

/* ===============================
   DATABASE CONNECTION
================================ */

mongoose
  .connect(process.env.MONGO_URI as string)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ Database Error:", err);
    process.exit(1);
  });

/* ===============================
   ROUTES
================================ */

// Health Check
app.get("/", (_req, res) => {
  res.json({ status: "AnimeHunt Backend Running 🚀" });
});

// All APIs
app.use("/api/ads", adRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api", analyticsRoutes);
app.use("/api/anime", animeRoutes);
app.use("/api", bannerRoutes);
app.use("/api", categoryRoutes);
app.use("/api", systemRoutes);
app.use("/api", downloadRoutes);
app.use("/api", episodeRoutes);
app.use("/api", footerRoutes);
app.use("/api", homepageRoutes);
app.use("/api", authRoutes);

// 🔒 Protect all admin routes
app.use("/api/admin", verifyAdmin);
app.use("/api", performanceRoutes);
app.use("/api", playerRoutes);
app.use("/api", searchRoutes);
app.use("/api", securityRoutes);
app.use("/api", seoRoutes);
app.use("/api", serverRoutes);
app.use("/api", sidebarRoutes);

/* ===============================
   GLOBAL ERROR HANDLER
================================ */

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("🔥 Error:", err.message);
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
});

/* ===============================
   START SERVER
================================ */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
