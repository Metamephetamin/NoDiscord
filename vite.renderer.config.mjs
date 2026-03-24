import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dns from "node:dns";

dns.setDefaultResultOrder("verbatim");

export default defineConfig({
  plugins: [react()],
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    proxy: {
      "/livekit": {
        target: "ws://127.0.0.1:7880",
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
