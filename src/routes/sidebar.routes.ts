import { Router } from "express";
import {
  getSidebarItems,
  saveSidebarItem,
  deleteSidebarItem
} from "../controllers/sidebar.controller";

const router = Router();

router.get("/", getSidebarItems);
router.post("/", saveSidebarItem);
router.delete("/", deleteSidebarItem);

export default router;
