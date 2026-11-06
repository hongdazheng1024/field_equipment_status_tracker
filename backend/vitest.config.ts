import { defineConfig } from "vitest/config";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/field_equipment_test";

export default defineConfig({
  test: {
    // Point every test worker at the test database, never the dev one.
    env: { NODE_ENV: "test", DATABASE_URL: TEST_DATABASE_URL },
    globalSetup: ["./test/globalSetup.ts"],
    // Integration tests share one database; run files one at a time.
    fileParallelism: false,
  },
});
