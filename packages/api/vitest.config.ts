import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/__tests__/setup.ts"],
    testTimeout: 10000,
    // Vitest 5 clears mocks before every test by default. Some suites (e.g.
    // pubsub) assert on calls recorded once at import time, so keep v4 behaviour.
    clearMocks: false,
  },
});
