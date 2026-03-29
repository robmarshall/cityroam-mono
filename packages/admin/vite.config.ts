import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  envDir: path.resolve(__dirname, "../.."),
  server: {
    host: "0.0.0.0",
    port: 5174,
  },
});
