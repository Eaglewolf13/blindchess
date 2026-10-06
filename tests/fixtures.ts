import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { test as base, expect } from '@playwright/test';

type Origin = { url: string; stop: () => Promise<void> } | null;
/** WebKit's offline-emulation bug kills even service-worker-only responses.
 * Close a test-owned origin instead. This tests server loss, not navigator.onLine.
 * https://github.com/microsoft/playwright/issues/42775
 */
export const test = base.extend<{ origin: Origin; disconnectOrigin: () => Promise<void> }>({
  origin: [
    async ({ browserName }, use) => {
      if (browserName !== 'webkit') {
        await use(null);
        return;
      }
      const root = resolve('dist');
      const types: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.wasm': 'application/wasm',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.webmanifest': 'application/manifest+json',
      };
      const server = createServer(async (request, response) => {
        try {
          const pathname = decodeURIComponent(
            new URL(request.url ?? '/', 'http://localhost').pathname,
          );
          const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
          if (!file.startsWith(root + sep)) {
            response.writeHead(403).end();
            return;
          }
          const bytes = await readFile(file);
          response.writeHead(200, {
            'Content-Type': types[extname(file)] ?? 'application/octet-stream',
            'Cache-Control': 'no-store',
          });
          response.end(bytes);
        } catch {
          response.writeHead(404).end();
        }
      });
      await new Promise<void>((done, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', done); // Let the OS choose a free port; do not occupy a preview's port.
      });
      let stopped = false;
      const stop = async () => {
        if (stopped) return;
        stopped = true;
        server.closeAllConnections();
        await new Promise<void>((done, reject) =>
          server.close((error) => (error ? reject(error) : done())),
        );
      };
      try {
        const { port } = server.address() as AddressInfo;
        await use({ url: `http://127.0.0.1:${port}`, stop });
      } finally {
        await stop();
      }
    },
    { auto: true },
  ],
  baseURL: async ({ origin }, use, testInfo) => {
    await use(origin?.url ?? testInfo.project.use.baseURL);
  },
  disconnectOrigin: async ({ context, origin, baseURL }, use) => {
    await use(async () => {
      if (origin) {
        await origin.stop();
        // Negative control: direct networking must now fail.
        await expect(fetch(baseURL!)).rejects.toThrow();
      } else await context.setOffline(true);
    });
  },
});
export { expect };
