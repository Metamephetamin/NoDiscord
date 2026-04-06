import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import dns from "node:dns";

dns.setDefaultResultOrder("verbatim");

export default defineConfig(({ command }) => ({
  base: command === "serve" ? "/" : "./",
  plugins: [react(), command === "serve" ? basicSsl() : null].filter(Boolean),
  server: {
    host: "localhost",
    port: 5173,
    strictPort: false,
    https: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:7031",
        changeOrigin: true,
        secure: false,
      },
      "/chatHub": {
        target: "http://127.0.0.1:7031",
        ws: true,
        changeOrigin: true,
        secure: false,
      },
      "/voiceHub": {
        target: "http://127.0.0.1:7031",
        ws: true,
        changeOrigin: true,
        secure: false,
      },
      "/avatars": {
        target: "http://127.0.0.1:7031",
        changeOrigin: true,
        secure: false,
      },
      "/chat-files": {
        target: "http://127.0.0.1:7031",
        changeOrigin: true,
        secure: false,
      },
      "/livekit": {
        target: "ws://127.0.0.1:7880",
        ws: true,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/livekit(?=\/|$)/, ""),
      },
    },
  },
}));
