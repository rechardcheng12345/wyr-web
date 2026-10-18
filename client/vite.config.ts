import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Follow the API's PORT from server/.env so the dev proxy can't drift from it.
  const apiPort = loadEnv(mode, path.resolve(__dirname, "../server"), "").PORT || "4000";
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    server: {
      port: 5173,
      proxy: { "/api": `http://localhost:${apiPort}` },
    },
  };
});
