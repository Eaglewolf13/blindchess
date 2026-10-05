import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { createReadStream, existsSync } from 'node:fs';
import type { Connect } from 'vite';

const localModel: Connect.NextHandleFunction = (req, res, next) => {
  if (req.url?.split('?')[0] !== '/models/vosk-en-0.15.tar.gz') return next();
  if (!existsSync('.asset-cache/vosk-en-0.15.tar.gz')) return next();
  res.setHeader('Content-Type', 'application/gzip');
  createReadStream('.asset-cache/vosk-en-0.15.tar.gz').pipe(res);
};

export default defineConfig({
  plugins: [
    {
      name: 'local-speech-model',
      configureServer: (server) => {
        server.middlewares.use(localModel);
      },
      configurePreviewServer: (server) => {
        server.middlewares.use(localModel);
      },
    },
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'favicon.svg',
        'icon-192.png',
        'icon-512.png',
        'audio-capture.js',
        'asset-manifest.json',
      ],
      manifest: {
        name: 'Apex — Blindfold Chess',
        short_name: 'Apex',
        description: 'A quiet place to build your chess vision. Play by voice, online or offline.',
        theme_color: '#233d32',
        background_color: '#f6f5ef',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Models are intentionally downloaded on demand; the app and engine are precached.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,json,txt}'],
        globIgnores: ['models/**'],
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/models\//, /^\/engine\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /\/models\/vosk-en-0\.15\.tar\.gz$/,
            handler: 'CacheOnly',
            options: { cacheName: 'apex-speech-v1' },
          },
        ],
      },
    }),
  ],
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
