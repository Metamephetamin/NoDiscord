// vite.main.config.mjs
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

export default defineConfig({
  plugins: [react()],
  server: {
    https: {
      key: fs.readFileSync('./src/livekit/livekit_certs/server-key.pem'),
      cert: fs.readFileSync('./src/livekit/livekit_certs/server-cert.pem'),
    },
    port: 5173,
    strictPort: true,
    hmr: true, // временно отключаем HMR для проверки WebSocket
  }
});
