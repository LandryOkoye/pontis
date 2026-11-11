import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Database tests create and migrate a throwaway Postgres database per file.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
