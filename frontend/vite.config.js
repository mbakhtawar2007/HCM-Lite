import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development, /api requests are proxied to the backend, so the
// frontend needs no backend URL at all. In production, set
// VITE_API_URL to your deployed backend (see frontend/.env.example).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
});
