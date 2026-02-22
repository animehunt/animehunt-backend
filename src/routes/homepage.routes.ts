import express from "express";
import {
  getHomepageRows,
  saveHomepageRow,
  deleteHomepageRow
} from "../controllers/homepage.controller";

const router = express.Router();

router.get("/admin/homepage", getHomepageRows);
router.post("/admin/homepage", saveHomepageRow);
router.delete("/admin/homepage", deleteHomepageRow);

export default router;
