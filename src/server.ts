import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { connectDB } from "./config/db";
import adsRoutes from "./routes/ads.routes";
import aiRoutes from "./routes/ai.routes";
import analyticsRoutes from "./routes/analytics.routes";
import animeRoutes from "./routes/anime.routes";
import bannerRoutes from "./routes/banner.routes";
import categoryRoutes from "./routes/category.routes";
import deployRoutes from "./routes/deploy.routes";
import downloadRoutes from "./routes/download.routes";
import episodeRoutes from "./routes/episode.routes";

dotenv.config();
connectDB();

const app = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: "10mb" }));

app.use("/api/admin/ads", adsRoutes);
app.use("/api/admin/ai", aiRoutes);
app.use("/api/admin/analytics", analyticsRoutes
app.use("/api/admin/anime", animeRoutes);
app.use("/api/admin/banners", bannerRoutes);
app.use("/api/admin/categories", categoryRoutes);
app.use("/api/admin/deploy", deployRoutes);
app.use("/api", maintenanceCheck);
app.use("/api/admin/download", downloadRoutes);
app.use("/api/admin/episodes", episodeRoutes);

app.get("/", (_req, res) => {
  res.send("AnimeHunt Ads API Running 🚀");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🔥 Server running on port ${PORT}`);
});
