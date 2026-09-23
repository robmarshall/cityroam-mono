import { defineConfig } from "vitest/config";

// .mts because packages/marketing is CommonJS (no "type": "module").
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
