import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the React app runs on :5173 and proxies API calls + uploaded images to the Node server on :4000,
// so cookies / relative URLs behave exactly like they do in production (where Node serves everything).
//
// changeOrigin MUST stay false: the server's CSRF check compares the browser's Origin (localhost:5173) with the
// Host header it receives. If the proxy rewrote Host to localhost:4000, every sign-in / save would be refused.
const api = { target: 'http://localhost:4000', changeOrigin: false };

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': api,
      '/uploads': api,
    },
  },
});
