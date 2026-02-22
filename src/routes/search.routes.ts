import express from "express";
import { getSearch, saveSearch } from "../controllers/search.controller";

const router = express.Router();

router.get("/admin/search", getSearch);
router.post("/admin/search", saveSearch);

export default router;
