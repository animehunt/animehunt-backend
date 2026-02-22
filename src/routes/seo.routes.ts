import express from "express";
import { getSEO, saveSEO } from "../controllers/seo.controller";

const router = express.Router();

router.get("/admin/seo", getSEO);
router.post("/admin/seo", saveSEO);

export default router;
