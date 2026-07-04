import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Backoffice Solatium — porta 5174 (app-loja usa 5173).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
});
