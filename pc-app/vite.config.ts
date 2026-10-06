import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: true,
    hmr: process.env.VITE_HMR_CLIENT_PORT ? { clientPort: Number(process.env.VITE_HMR_CLIENT_PORT) } : undefined,
    // Preview convenience only: serve the admin app (running on :3001) under /admin.
    proxy: { '/admin': { target: 'http://127.0.0.1:3001', ws: true } },
  },
});
