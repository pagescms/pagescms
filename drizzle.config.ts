import "./db/envConfig";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL)!,
  },
});
