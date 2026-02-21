import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoSanitize from "mongo-sanitize";
import mongoose from "mongoose";

dotenv.config();

const app = express();

// Security Middlewares
app.use(helmet());
app.use(cors({
  origin: ["https://your-frontend.pages.dev"], 
  credentials: true
}));

app.use(express.json({ limit: "10kb" }));

// Rate Limiting (Anti DDoS basic protection)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300
});
app.use(limiter);

// Mongo sanitize
app.use((req, res, next) => {
  if (req.body) {
    req.body = mongoSanitize(req.body);
  }
  next();
});

// MongoDB Connect
mongoose.connect(process.env.MONGO_URI as string)
.then(() => console.log("MongoDB Connected"))
.catch(err => {
  console.error("DB Error:", err);
  process.exit(1);
});

// Health Check
app.get("/", (req, res) => {
  res.json({ status: "AnimeHunt Backend Running 🚀" });
});

// Start Server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
