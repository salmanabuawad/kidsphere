import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));
const env = loadEnv("test", process.cwd(), "");
const testDb = env.TEST_DATABASE_URL ?? "postgresql://kidsphere:kidsphere@localhost:5433/ks_test";

const alias = {
  "@": path.resolve(root, "src"),
  // `server-only` throws outside the React server runtime; tests exercise server modules directly.
  "server-only": path.resolve(root, "tests/helpers/server-only-stub.ts"),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
          env: { NODE_ENV: "test", DATABASE_URL: testDb, AUTH_SECRET: "test-secret-test-secret-test-secret-123" },
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/helpers/global-setup.ts"],
          // One database, so files run sequentially.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
          env: {
            NODE_ENV: "test",
            DATABASE_URL: testDb,
            AUTH_SECRET: "test-secret-test-secret-test-secret-123",
            AI_DEFAULT_PROVIDER: "demo",
            ANTHROPIC_API_KEY: "",
            OPENAI_API_KEY: "",
            STORAGE_DRIVER: "local",
            STORAGE_LOCAL_DIR: ".data/test-storage",
          },
        },
      },
    ],
  },
});
