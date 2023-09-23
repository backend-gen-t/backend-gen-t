import { Router } from "express";
import vacaciones from "../controllers/vacaciones.js";

const router = Router();

router.get("/", vacaciones.get);

export default router;