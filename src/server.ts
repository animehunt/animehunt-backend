import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { connectDB } from "./config/db";
import adsRoutes from "./routes/ads.routes";

dotenv.config();
connectDB();

const app = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: "10mb" }));

app.use("/api/admin/ads", adsRoutes);

app.get("/", (_req, res) => {
  res.send("AnimeHunt Ads API Running 🚀");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🔥 Server running on port ${PORT}`);
});
