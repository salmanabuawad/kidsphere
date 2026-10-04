import { execSync } from "node:child_process";

/** Apply migrations to the dedicated test database before integration tests. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://kidsphere:kidsphere@localhost:5433/ks_test";
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
}
