import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
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
import downloadRoutes from "./routes/download.routes";
import episodeRoutes from "./routes/episode.routes";
import homepageRoutes from "./routes/homepage.routes";
import performanceRoutes from "./routes/performance.routes";
import playerRoutes from "./routes/player.routes";
import searchRoutes from "./routes/search.routes";
import securityRoutes from "./routes/security.routes";
import seoRoutes from "./routes/seo.routes";
import serverRoutes from "./routes/server.routes";
import sidebarRoutes from "./routes/sidebar.routes";
import footerRoutes from "./routes/footer.routes";
import systemRoutes from "./routes/system.routes";

import authRoutes from "./routes/auth.routes";

/* ===============================
   BASIC SETUP
================================ */

dotenv.config();
const app = express();
app.set("trust proxy", 1);

/* ===============================
   SECURITY
================================ */

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

/* ===============================
   CORS (Simple Version)
================================ */

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

/* ===============================
   BODY PARSER
================================ */

app.use(express.json({ limit: "10kb" }));

/* ===============================
   MONGO SANITIZE
================================ */

app.use((req, _res, next) => {
  if (req.body) {
    req.body = mongoSanitize(req.body);
  }
  next();
});

/* ===============================
   DATABASE
================================ */

mongoose.set("strictQuery", true);

mongoose
  .connect(process.env.MONGO_URI as string)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ Database Error:", err);
    process.exit(1);
  });

/* ===============================
   HEALTH CHECK
================================ */

app.get("/", (_req, res) => {
  res.json({
    status: "AnimeHunt Backend Running 🚀",
  });
});

/* ===============================
   AUTH ROUTE (UNPROTECTED)
================================ */

app.use("/api/auth", authRoutes);

/* ===============================
   ALL ROUTES (NO PROTECTION)
================================ */

app.use("/api/ads", adRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/anime", animeRoutes);
app.use("/api", bannerRoutes);
app.use("/api", analyticsRoutes);
app.use("/api", downloadRoutes);
app.use("/api", episodeRoutes);
app.use("/api", homepageRoutes);

app.use("/api/admin", performanceRoutes);
app.use("/api/admin", playerRoutes);
app.use("/api/admin", searchRoutes);
app.use("/api/admin", securityRoutes);
app.use("/api/admin", seoRoutes);
app.use("/api/admin", serverRoutes);
app.use("/api/admin", sidebarRoutes);
app.use("/api/admin", footerRoutes);
app.use("/api/admin", systemRoutes);

/* ===============================
   GLOBAL ERROR HANDLER
================================ */

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("🔥 Error:", err.message);
  res.status(500).json({ message: "Server Error" });
});

/* ===============================
   START SERVER
================================ */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
