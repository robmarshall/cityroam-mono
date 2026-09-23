import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    // Source only. Without this, vitest's default glob also picks up the
    // compiled copies under the gitignored dist/, so every test ran twice —
    // once against source and once against whatever was last built.
    include: ["src/**/*.test.ts"],
  },
});
