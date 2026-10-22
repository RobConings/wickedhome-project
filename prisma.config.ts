import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer reads .env by itself.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on the real environment (e.g. CI).
}

export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --env-file=.env prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
