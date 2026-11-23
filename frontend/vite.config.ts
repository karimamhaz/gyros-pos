import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

// In development Vite stands in for the Electron proxy that adds the launch secret.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.POS_PORT ?? 8765}`,
        headers: { "X-Launch-Secret": process.env.POS_LAUNCH_SECRET ?? "dev" },
      },
    },
  },
  test: { environment: "jsdom" },
});
