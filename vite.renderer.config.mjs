import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

export default defineConfig(({ command }) => ({
  base: "/",
  plugins: [react(), command === "serve" ? basicSsl() : null].filter(Boolean),
  build: {
    // The RNNoise bundle is an intentionally isolated optional chunk.
    // Raise the generic warning threshold so regular builds stay signal-rich.
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = String(id || "").replace(/\\/g, "/");

          if (normalizedId.includes("@shiguredo/noise-suppression")) {
            return "noise_suppression";
          }

          if (normalizedId.includes("/src/webrtc/")) {
            return "voice";
          }

          if (normalizedId.includes("/node_modules/livekit-client/")
            || normalizedId.includes("/node_modules/@livekit/")) {
            return "livekit";
          }

          if (normalizedId.includes("/node_modules/@microsoft/signalr/")) {
            return "signalr";
          }

          if (normalizedId.includes("/node_modules/react-player/")) {
            return "media-player";
          }

          return undefined;
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
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
