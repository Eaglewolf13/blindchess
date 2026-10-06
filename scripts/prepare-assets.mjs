// Reproducible local assets: no third-party CDNs are used by the running application.
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { unzipSync } from 'fflate';
import tar from 'tar-stream';
import './generate-icons.mjs';
import { prepareWhisper } from './prepare-whisper.mjs';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
await mkdir('public/engine', { recursive: true });
await mkdir('public/models', { recursive: true });
await mkdir('.asset-cache', { recursive: true });
for (const ext of ['js', 'wasm']) {
  await copyFile(
    `node_modules/stockfish/bin/stockfish-18-lite-single.${ext}`,
    `public/engine/stockfish.${ext}`,
  );
}
await copyFile('node_modules/stockfish/Copying.txt', 'public/engine/COPYING.txt');
await writeFile(
  'public/engine/SOURCE.txt',
  'Stockfish.js 18.0.5, lite single-threaded WebAssembly build.\nGPL-3.0.\nNpm release gitHead: 082eeba46b0c5f8f8065e5386750aa0ecfa2062c\nCorresponding source and build instructions: https://github.com/nmrugg/stockfish.js/tree/082eeba46b0c5f8f8065e5386750aa0ecfa2062c\nSource archive: https://github.com/nmrugg/stockfish.js/archive/082eeba46b0c5f8f8065e5386750aa0ecfa2062c.tar.gz\n',
);
console.log('Stockfish engine copied (single-threaded, 7 MB).');

const zipPath = '.asset-cache/vosk-model-small-en-us-0.15.zip';
const modelPath = '.asset-cache/vosk-en-0.15.tar.gz';
const formatMarker = '.asset-cache/archive-format-v2';
if (!existsSync(zipPath)) {
  console.log('Downloading the English Vosk model from alphacephei.com…');
  const response = await fetch(
    'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip',
    { signal: AbortSignal.timeout(180000) },
  );
  if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status}`);
  await writeFile(zipPath, Buffer.from(await response.arrayBuffer()));
}
const zip = await readFile(zipPath);
const lockPath = 'scripts/model-checksum.json';
if (existsSync(lockPath)) {
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  if (lock.sha256 !== sha256(zip))
    throw new Error('Speech model checksum mismatch. Remove the cached download and retry.');
} else {
  await writeFile(
    lockPath,
    JSON.stringify({ file: 'vosk-model-small-en-us-0.15.zip', sha256: sha256(zip) }, null, 2) +
      '\n',
  );
}
if (!existsSync(modelPath) || !existsSync(formatMarker)) {
  console.log('Converting model to the Vosk browser archive format…');
  const files = unzipSync(zip);
  const pack = tar.pack();
  const output = pipeline(pack, createGzip({ level: 6 }), createWriteStream(modelPath));
  for (const name of Object.keys(files).sort()) {
    const directory = name.endsWith('/');
    // Emscripten's untar requires explicit directory entries before their files.
    await new Promise((resolve, reject) =>
      pack.entry(
        {
          name: name.replace('vosk-model-small-en-us-0.15/', 'model/'),
          type: directory ? 'directory' : 'file',
          mode: directory ? 0o755 : 0o644,
          size: directory ? 0 : files[name].length,
          mtime: new Date('2020-01-01T00:00:00Z'),
        },
        Buffer.from(files[name]),
        (error) => (error ? reject(error) : resolve()),
      ),
    );
  }
  pack.finalize();
  await output;
  await writeFile(formatMarker, 'Explicit directories, archive format v2.\n');
}
const model = await readFile(modelPath);
const parts = [];
const chunkSize = 20 * 1024 * 1024; // Under Cloudflare's 25 MiB static-asset limit.
for (let offset = 0, i = 0; offset < model.length; offset += chunkSize, i++) {
  const data = model.subarray(offset, offset + chunkSize);
  const filename = `vosk-en-0.15-${i}.bin`;
  await writeFile(`public/models/${filename}`, data);
  parts.push({ url: `/models/${filename}`, bytes: data.length, sha256: sha256(data) });
}
const whisper = await prepareWhisper();
await writeFile(
  'public/asset-manifest.json',
  JSON.stringify(
    {
      version: 1,
      whisper,
      engine: 'Stockfish 18 lite, single-threaded',
      model: {
        name: 'Vosk small English (US) 0.15',
        url: '/models/vosk-en-0.15.tar.gz',
        bytes: model.length,
        sha256: sha256(model),
        parts,
      },
    },
    null,
    2,
  ),
);
console.log(
  `Speech model ready: ${(model.length / 1024 / 1024).toFixed(1)} MB, ${parts.length} hosting-friendly parts.`,
);
