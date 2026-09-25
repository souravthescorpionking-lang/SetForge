import { PrismaClient } from "@prisma/client";

// Prisma client singleton. Pool sizing / retries are handled by the env contract
// (DATABASE_POOL_MAX applies to Postgres hosts; SQLite ignores it).
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export async function disconnectDb(): Promise<void> {
  await db.$disconnect();
}
