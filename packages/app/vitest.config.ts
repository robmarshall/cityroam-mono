import { defineConfig } from "vitest/config";

// Standalone config — deliberately does NOT extend vite.config.ts, so the
// react/tailwind plugins are not loaded for a plain node-environment run.
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
