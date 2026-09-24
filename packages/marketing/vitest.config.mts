import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// .mts because packages/marketing is CommonJS (no "type": "module").
export default defineConfig({
  resolve: {
    // The same "@/…" alias as tsconfig.json, so tests can import app code
    // such as the sitemap.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
