import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/** Fresh, seeded e2e database for every run. */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgresql://kidsphere:kidsphere@localhost:5433/ks_e2e";
  if (!/e2e/.test(url)) throw new Error("E2E must run against a dedicated e2e database");
  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx prisma migrate deploy", { stdio: "pipe", env });
  const db = new PrismaClient({ datasources: { db: { url } } });
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
  await db.$disconnect();
  execSync("npx tsx prisma/seed.ts", { stdio: "pipe", env });
}
