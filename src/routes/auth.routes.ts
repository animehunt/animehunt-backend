import express from "express";
import { login, verify } from "../controllers/auth.controller";

const router = express.Router();

router.post("/auth/login", login);
router.post("/auth/verify", verify);

export default router;
