import { Router } from "express";
import { getHorariosHandler } from "../controllers/horarios.controller.js";

const horariosRouter = Router();

horariosRouter.get("/", getHorariosHandler);

export default horariosRouter;
