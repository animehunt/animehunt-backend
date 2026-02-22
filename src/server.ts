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
