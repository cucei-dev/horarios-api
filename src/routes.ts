import { Router } from "express";

import { getStatus } from "./controllers/status.controller.js";

const router = Router();

router.get("/", getStatus);
router.get("/api", getStatus);
router.get("/api/v1", getStatus);

export default router;
