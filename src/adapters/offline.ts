export interface AssetManifest {
  version: number;
  engine: string;
  model: {
    name: string;
    url: string;
    bytes: number;
    sha256: string;
    parts: { url: string; bytes: number; sha256: string }[];
  };
}
const MODEL_URL = '/models/vosk-en-0.15.tar.gz';
const CACHE = 'apex-speech-v1';
export async function hasSpeechModel(): Promise<boolean> {
  return 'caches' in window && !!(await (await caches.open(CACHE)).match(MODEL_URL));
}
async function hash(buffer: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export async function downloadSpeechModel(onProgress: (percent: number) => void): Promise<void> {
  if (!('caches' in window))
    throw new Error('Offline speech needs HTTPS or localhost and a browser with offline storage.');
  const cache = await caches.open(CACHE);
  if (await cache.match(MODEL_URL)) {
    onProgress(100);
    return;
  }
  const response = await fetch('/asset-manifest.json');
  if (!response.ok || !response.headers.get('content-type')?.includes('json'))
    throw new Error('Speech assets are missing. Run npm run assets, then rebuild the app.');
  const manifest: AssetManifest = await response.json();
  const parts: ArrayBuffer[] = [];
  let downloaded = 0;
  for (const part of manifest.model.parts) {
    const result = await fetch(part.url);
    if (!result.ok || !result.body)
      throw new Error('The speech download was interrupted. Check your connection and try again.');
    const reader = result.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      downloaded += value.byteLength;
      onProgress(Math.min(99, Math.round((downloaded / manifest.model.bytes) * 100)));
    }
    const bytes = await new Blob(chunks).arrayBuffer();
    if (bytes.byteLength !== part.bytes || (await hash(bytes)) !== part.sha256)
      throw new Error('The downloaded speech model is incomplete. Please retry.');
    parts.push(bytes);
  }
  const blob = new Blob(parts, { type: 'application/gzip' });
  if ((await hash(await blob.arrayBuffer())) !== manifest.model.sha256)
    throw new Error('Speech model verification failed. Please retry.');
  await cache.put(
    MODEL_URL,
    new Response(blob, { headers: { 'Content-Type': 'application/gzip' } }),
  );
  // Browsers may decline this request; the UI never promises permanent storage.
  await navigator.storage?.persist?.().catch(() => false);
  onProgress(100);
}
export async function speechModelUrl(): Promise<string> {
  if (!(await hasSpeechModel())) throw new Error('Download the English voice pack first.');
  if (import.meta.env.PROD) {
    if (!('serviceWorker' in navigator))
      throw new Error('This browser cannot load the offline voice pack.');
    await Promise.race([
      (async () => {
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller)
          await new Promise<void>((resolve) =>
            navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
              once: true,
            }),
          );
      })(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Reload once to activate offline speech.')), 10000),
      ),
    ]);
  }
  return new URL(MODEL_URL, window.location.href).href;
}
