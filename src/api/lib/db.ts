import { PrismaClient } from "../generated/prisma/client";
import { config } from "./config";
import { SerialTransactionPrismaPg } from "./prisma-adapter";

// Transactions run their queries one at a time on their single connection (see prisma-adapter.ts).
export const db = new PrismaClient({
  adapter: new SerialTransactionPrismaPg({ connectionString: config.DATABASE_URL }),
});

export * from "../generated/prisma/client";
