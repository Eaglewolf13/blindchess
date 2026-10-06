import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { createReadStream, existsSync } from 'node:fs';
import type { Connect } from 'vite';

const localModel: Connect.NextHandleFunction = (req, res, next) => {
  const path = req.url?.split('?')[0] ?? '';
  // Only known, safe model filenames are served from the development cache.
  if (/^\/models\/(whisper-tiny\.en|whisper-runtime)\/(onnx\/)?[a-zA-Z0-9_.-]+$/.test(path)) {
    if (!existsSync(`.asset-cache${path}`)) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader(
      'Content-Type',
      path.endsWith('.mjs')
        ? 'text/javascript'
        : path.endsWith('.wasm')
          ? 'application/wasm'
          : path.endsWith('.json')
            ? 'application/json'
            : 'application/octet-stream',
    );
    createReadStream(`.asset-cache${path}`).pipe(res);
    return;
  }
  if (req.url?.split('?')[0] !== '/models/vosk-en-0.15.tar.gz') return next();
  if (!existsSync('.asset-cache/vosk-en-0.15.tar.gz')) return next();
  res.setHeader('Content-Type', 'application/gzip');
  createReadStream('.asset-cache/vosk-en-0.15.tar.gz').pipe(res);
};

export default defineConfig({
  worker: { format: 'es' },
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
        globIgnores: ['models/**', 'assets/ort-*.wasm'],
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/models\//, /^\/engine\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /\/models\/whisper-(tiny\.en|runtime)\//,
            handler: 'CacheOnly',
            options: { cacheName: 'apex-whisper-v1' },
          },
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
