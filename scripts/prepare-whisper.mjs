import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const hash = (data) => createHash('sha256').update(data).digest('hex');
const repository = 'onnx-community/whisper-tiny.en';
const lockPath = 'scripts/whisper-checksums.json';
const names = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
];

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(240000) });
  if (!response.ok) throw new Error(`Whisper download failed: HTTP ${response.status}: ${url}`);
  return response;
}

export async function prepareWhisper() {
  const lock = existsSync(lockPath)
    ? JSON.parse(await readFile(lockPath, 'utf8'))
    : {
        repository,
        revision: (await (await get(`https://huggingface.co/api/models/${repository}`)).json()).sha,
        files: {},
      };
  const files = [];
  async function asset(url, data, contentType) {
    const parts = [];
    for (let offset = 0, i = 0; offset < data.length; offset += 20 * 1024 * 1024, i++) {
      const chunk = data.subarray(offset, offset + 20 * 1024 * 1024);
      const partUrl = `/models/whisper-parts/${url.split('/').pop()}-${i}.bin`;
      await mkdir('public/models/whisper-parts', { recursive: true });
      await writeFile(`public${partUrl}`, chunk);
      parts.push({ url: partUrl, bytes: chunk.length, sha256: hash(chunk) });
    }
    const local = `.asset-cache${url}`;
    await mkdir(local.slice(0, local.lastIndexOf('/')), { recursive: true });
    await writeFile(local, data);
    files.push({ url, bytes: data.length, sha256: hash(data), contentType, parts });
  }
  for (const name of names) {
    const url = `/models/whisper-tiny.en/${name}`;
    const local = `.asset-cache${url}`;
    let data;
    if (existsSync(local)) data = await readFile(local);
    else {
      console.log(`Downloading Whisper ${name}...`);
      data = Buffer.from(
        await (
          await get(`https://huggingface.co/${repository}/resolve/${lock.revision}/${name}`)
        ).arrayBuffer(),
      );
    }
    if (lock.files[name] && lock.files[name] !== hash(data))
      throw new Error(`Whisper checksum mismatch: ${name}`);
    lock.files[name] = hash(data);
    await asset(
      url,
      data,
      name.endsWith('.json') ? 'application/json' : 'application/octet-stream',
    );
  }
  for (const name of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) {
    await asset(
      `/models/whisper-runtime/${name}`,
      await readFile(`node_modules/onnxruntime-web/dist/${name}`),
      name.endsWith('.mjs') ? 'text/javascript' : 'application/wasm',
    );
  }
  await writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n');
  const bytes = files.reduce((sum, file) => sum + file.bytes, 0);
  console.log(`Whisper pack ready: ${(bytes / 1024 / 1024).toFixed(1)} MiB.`);
  return { name: 'Whisper tiny.en (quantized), WASM runtime', bytes, files };
}
