import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Build-time git SHA for the Sentry release when VITE_SENTRY_RELEASE is unset:
// Vercel exposes VERCEL_GIT_COMMIT_SHA, Coolify SOURCE_COMMIT. Empty otherwise.
const buildSha = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.SOURCE_COMMIT || "").trim();

export default defineConfig({
  define: {
    __SENTRY_BUILD_SHA__: JSON.stringify(buildSha),
  },
  base: "/",
  plugins: [react(), tailwindcss()],
  envDir: path.resolve(__dirname, "../.."),
  server: {
    host: "0.0.0.0",
    port: 5174,
  },
});
