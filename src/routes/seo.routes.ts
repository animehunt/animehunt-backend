import { Router } from "express";
import { getSEO, saveSEO } from "../controllers/seo.controller";

const router = Router();

router.get("/", getSEO);
router.post("/", saveSEO);

export default router;
