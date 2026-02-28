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
import footerRoutes from "./routes/footer.routes";
import homepageRoutes from "./routes/homepage.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import performanceRoutes from "./routes/performance.routes";
import playerRoutes from "./routes/player.routes";
import searchRoutes from "./routes/search.routes";
import securityRoutes from "./routes/security.routes";
import securityStatsRoutes from "./routes/securityStats.routes";
import serverRoutes from "./routes/server.routes";
import sidebarRoutes from "./routes/sidebar.routes";

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
app.use("/api/admin/footer", footerRoutes);
app.use("/api/admin/homepage", homepageRoutes);
app.use("/api/admin/dashboard", dashboardRoutes);
app.use("/api/admin/performance", performanceRoutes);
app.use("/api/admin/player", playerRoutes);
app.use("/api/admin/search", searchRoutes);
app.use("/api/admin/security", securityRoutes);
app.use("/api/security", securityStatsRoutes);
app.use("/api/admin/servers", serverRoutes);
app.use("/api/admin/sidebar", sidebarRoutes);

app.get("/", (_req, res) => {
  res.send("AnimeHunt Ads API Running 🚀");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🔥 Server running on port ${PORT}`);
});
