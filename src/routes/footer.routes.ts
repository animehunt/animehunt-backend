import express from "express";
import {
  getFooter,
  saveFooter,
  killFooter
} from "../controllers/footer.controller";

const router = express.Router();

router.get("/admin/footer", getFooter);
router.post("/admin/footer", saveFooter);
router.post("/admin/footer/kill", killFooter);

export default router;
