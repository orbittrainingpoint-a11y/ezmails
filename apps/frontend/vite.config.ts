import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Dev server proxies API + WebSocket to the admin-api so the SPA can use
// same-origin relative URLs (matching the Nginx setup in production).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:4002", changeOrigin: true },
      "/ws": { target: "ws://localhost:4002", ws: true },
      "/webmail-api": { target: "http://localhost:4003", changeOrigin: true },
    },
  },
});
