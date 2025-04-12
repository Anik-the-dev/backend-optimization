import { configDotenv } from "dotenv";

configDotenv();

export default {
  env: process.env.NODE_ENV,
  database_url: process.env.DATABASE_URL,
  DB_UPLOAD_CHUNK_SIZE: process.env.DB_UPLOAD_CHUNK_SIZE
};