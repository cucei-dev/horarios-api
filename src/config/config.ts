import dotenv from "dotenv";

dotenv.config();

export default {
  APP_PORT: process.env.PORT || 3000,
  APP_VERSION: "1.0.0",
  APP_SITE: process.env.APP_SITE,
  APP_NAME: process.env.APP_NAME,
  APP_DESCRIPTION: process.env.APP_DESCRIPTION,
  APP_DEBUG: process.env.APP_DEBUG === "true",
  SIIAPI_URL: process.env.SIIAPI_URL ?? "https://api.cucei.dev",
  MONGODB_URI: process.env.MONGODB_URI ?? "mongodb://localhost:27017/horarios",
  CACHE_TTL_MINUTES: parseInt(process.env.CACHE_TTL_MINUTES ?? "1440", 10),
};
