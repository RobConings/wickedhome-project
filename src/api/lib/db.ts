import { PrismaClient } from "../generated/prisma/client";
import { config } from "./config";
import { SerialTransactionPrismaPg } from "./prisma-adapter";

// Transactions run their queries one at a time on their single connection (see prisma-adapter.ts).
export const db = new PrismaClient({
  // Prisma's timestamp transport assumes UTC; household wall-clock calculations opt into Brussels.
  adapter: new SerialTransactionPrismaPg({ connectionString: config.DATABASE_URL, options: "-c timezone=UTC" }),
});

export * from "../generated/prisma/client";
