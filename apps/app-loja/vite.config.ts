import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Config do app-loja (PWA mobile-first do vendedor).
export default defineConfig({
  server: { port: 5173 },
  preview: { port: 5173 },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Proteção Solatium — Loja',
        short_name: 'Solatium Loja',
        description: 'App do vendedor da loja parceira Proteção Solatium.',
        lang: 'pt-BR',
        theme_color: '#0B2545',
        background_color: '#0B2545',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
});
