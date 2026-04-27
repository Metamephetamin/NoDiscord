import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const DEV_RENDERER_CSP = "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: https:; media-src 'self' data: blob: http: https:; font-src 'self' data:; connect-src 'self' http: https: ws: wss:; worker-src 'self' blob:;";
const PROD_RENDERER_CSP = "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: https:; media-src 'self' data: blob: http: https:; font-src 'self' data:; connect-src 'self' http: https: ws: wss:; worker-src 'self' blob:;";

export default defineConfig(({ command }) => ({
  base: "/",
  plugins: [
    react(),
    {
      name: "tend-renderer-csp",
      transformIndexHtml(html) {
        const csp = command === "serve" ? DEV_RENDERER_CSP : PROD_RENDERER_CSP;
        return html.replace(
          /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")[^"]*("\s*\/>)/i,
          `$1${csp}$2`
        );
      },
    },
    command === "serve" ? basicSsl() : null,
  ].filter(Boolean),
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
        target: "http://127.0.0.1:7880",
        ws: true,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/livekit(?=\/|$)/, ""),
      },
    },
  },
}));
