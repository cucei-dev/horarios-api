import express from "express";
import type { Application } from "express";
import cors from "cors";
import morgan from "morgan";
import router from "./routes.js";
import { connectDatabase } from "./config/database.js";

const app: Application = express();

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.use("/", router);

connectDatabase().catch((err: unknown) => {
  console.error("Failed to connect to MongoDB:", err);
  process.exit(1);
});

export default app;
