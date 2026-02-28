import { Router } from "express";
import {
  getFooter,
  saveFooter,
  killFooter
} from "../controllers/footer.controller";

const router = Router();

router.get("/", getFooter);
router.post("/", saveFooter);
router.post("/kill", killFooter);

export default router;
