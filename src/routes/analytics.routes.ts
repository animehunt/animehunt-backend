import express from "express";
import { getAdminAnalytics } from "../controllers/analytics.controller";

const router = express.Router();

router.get("/admin/analytics", getAdminAnalytics);

export default router;
