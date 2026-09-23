import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    // Source only, so compiled copies under the gitignored dist/ never run.
    include: ["src/**/*.test.ts"],
  },
});
