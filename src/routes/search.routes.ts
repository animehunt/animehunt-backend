import { Router } from "express";
import {
  getSearchConfig,
  saveSearchConfig
} from "../controllers/search.controller";

const router = Router();

router.get("/", getSearchConfig);
router.post("/", saveSearchConfig);

export default router;
