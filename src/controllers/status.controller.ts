import type { Request, Response } from "express";
import config from "../config/config.js";

export const getStatus = (req: Request, res: Response) => {
  res.json(
    {
      status: "ok",
      version: config.APP_VERSION,
      site: config.APP_SITE,
      name: config.APP_NAME,
      description: config.APP_DESCRIPTION,
      debug: config.APP_DEBUG
    }
  );
};
