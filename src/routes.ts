import { Router } from "express";

import { getStatus } from "./controllers/status.controller.js";
import horariosRouter from "./routes/horarios.routes.js";

const router = Router();

router.get("/", getStatus);
router.get("/api", getStatus);
router.get("/api/v1", getStatus);

router.use("/api/v1/horarios", horariosRouter);

export default router;
