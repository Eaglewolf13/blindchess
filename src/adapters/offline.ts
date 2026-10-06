import type { Settings } from '../domain/types';
export type RecognizerChoice = Settings['speechRecognizer'];
export const RECOGNIZERS: Record<
  RecognizerChoice,
  { label: string; size: string; description: string }
> = {
  vosk: {
    label: 'Vosk · chess vocabulary',
    size: '39.8 MB',
    description: 'Fast, with a restricted vocabulary. The current default.',
  },
  'vosk-open': {
    label: 'Vosk · general English',
    size: '39.8 MB',
    description:
      'Same download, unrestricted transcription. Useful for spotting how your words are heard.',
  },
  whisper: {
    label: 'Whisper · tiny English',
    size: '62.2 MB',
    description:
      'A different local model. Experimental; waits for a pause and may be slower on phones.',
  },
};
interface ModelAsset {
  url: string;
  bytes: number;
  sha256: string;
  contentType?: string;
  parts: { url: string; bytes: number; sha256: string }[];
}
export interface AssetManifest {
  version: number;
  engine: string;
  whisper: { name: string; bytes: number; files: ModelAsset[] };
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
const WHISPER_CACHE = 'apex-whisper-v1';
const WHISPER_READY = '/models/whisper-ready-v1';
export async function hasSpeechModel(provider: RecognizerChoice = 'vosk'): Promise<boolean> {
  if (!('caches' in window)) return false;
  if (provider !== 'whisper') return !!(await (await caches.open(CACHE)).match(MODEL_URL));
  const cache = await caches.open(WHISPER_CACHE);
  const marker = await cache.match(WHISPER_READY);
  if (!marker) return false;
  const urls: string[] = await marker.json();
  return (await Promise.all(urls.map((url) => cache.match(url)))).every(Boolean);
}
async function hash(buffer: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export async function downloadSpeechModel(
  onProgress: (percent: number) => void,
  provider: RecognizerChoice = 'vosk',
): Promise<void> {
  if (!('caches' in window))
    throw new Error('Offline speech needs HTTPS or localhost and a browser with offline storage.');
  const cache = await caches.open(provider === 'whisper' ? WHISPER_CACHE : CACHE);
  if (await hasSpeechModel(provider)) {
    onProgress(100);
    return;
  }
  const response = await fetch('/asset-manifest.json');
  if (!response.ok || !response.headers.get('content-type')?.includes('json'))
    throw new Error('Speech assets are missing. Run npm run assets, then rebuild the app.');
  const manifest: AssetManifest = await response.json();
  if (provider === 'whisper' && !manifest.whisper)
    throw new Error('Whisper assets are missing. Run npm run assets, rebuild, and reload the app.');
  const assets: ModelAsset[] = provider === 'whisper' ? manifest.whisper.files : [manifest.model];
  const total = assets.reduce((sum, asset) => sum + asset.bytes, 0);
  let downloaded = 0;
  for (const asset of assets) {
    if (await cache.match(asset.url)) {
      downloaded += asset.bytes;
      continue;
    }
    const parts: ArrayBuffer[] = [];
    for (const part of asset.parts) {
      const result = await fetch(part.url);
      if (!result.ok || !result.body)
        throw new Error(
          'The speech download was interrupted. Check your connection and try again.',
        );
      const reader = result.body.getReader();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        downloaded += value.byteLength;
        onProgress(Math.min(99, Math.round((downloaded / total) * 100)));
      }
      const bytes = await new Blob(chunks).arrayBuffer();
      if (bytes.byteLength !== part.bytes || (await hash(bytes)) !== part.sha256)
        throw new Error('The downloaded speech model is incomplete. Please retry.');
      parts.push(bytes);
    }
    const contentType = asset.contentType ?? 'application/gzip';
    const blob = new Blob(parts, { type: contentType });
    if ((await hash(await blob.arrayBuffer())) !== asset.sha256)
      throw new Error('Speech model verification failed. Please retry.');
    await cache.put(asset.url, new Response(blob, { headers: { 'Content-Type': contentType } }));
  }
  if (provider === 'whisper')
    await cache.put(WHISPER_READY, new Response(JSON.stringify(assets.map((asset) => asset.url))));
  // Browsers may decline this request; the UI never promises permanent storage.
  await navigator.storage?.persist?.().catch(() => false);
  onProgress(100);
}
export async function speechModelUrl(provider: RecognizerChoice = 'vosk'): Promise<string> {
  if (!(await hasSpeechModel(provider)))
    throw new Error('Download the selected English voice pack first.');
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
