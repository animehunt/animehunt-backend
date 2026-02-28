import { Router } from "express";
import {
  createRow,
  getRows,
  getSingleRow,
  updateRow,
  deleteRow
} from "../controllers/homepage.controller";

const router = Router();

router.get("/", getRows);
router.get("/:id", getSingleRow);
router.post("/", createRow);
router.patch("/:id", updateRow);
router.delete("/:id", deleteRow);

export default router;
