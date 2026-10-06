# Deploy as a static website

The first release has no server runtime or secrets. Build `dist/` and serve it over HTTPS. A custom domain is optional; a provider subdomain is sufficient.

## Cloudflare Pages

1. Push this repository to your GitHub account when you are ready to publish it.
2. Create a Pages project connected to the repository.
3. Set the build environment to Node.js 24.
4. Use build command `npm ci && npm run assets && npm run build` and output directory `dist`.
5. Deploy. Open the HTTPS URL and verify microphone access, offline readiness, an engine move, and a voice command.

Both English models are downloaded at build time from their upstream publishers. Cache `.asset-cache` in CI if supported. Do not commit expanded dependencies or model files. Vosk is pinned by `scripts/model-checksum.json`; Whisper's repository revision and file hashes are pinned by `scripts/whisper-checksums.json`.

The model's two `.bin` files are below Cloudflare Pages' 25 MiB per-file limit. Stockfish uses a 7 MB single-threaded build, so cross-origin-isolation headers and SharedArrayBuffer are not required. Large model parts are fetched only when a user asks to prepare voice, then assembled locally. The Vosk virtual archive URL is served from Cache Storage by the service worker.

Whisper's files are similarly split into 20 MiB parts and reassembled in a separate cache. The service worker serves its JSON, ONNX, and runtime resources under `/models/whisper-tiny.en/` and `/models/whisper-runtime/`, including correct JavaScript and WASM MIME types. Do not replace these virtual paths with an HTML fallback. Whisper uses one WASM thread and requires no external inference API.

Keep `public/_headers` in the build: it configures long-lived hashed assets, fresh service-worker/manifest requests, MIME sniffing protection, and microphone access for the same origin. Other hosting providers may need equivalent header configuration.

## Verify an update

- Build and run `npm run test:e2e` before uploading.
- Confirm that a returning user receives an update prompt.
- Apply the update after a move is saved; check that saved games and preferences remain.
- Download voice, close and reopen the installed app in airplane mode, and check both speech recognition and spoken output.

Free static hosting does not mean unlimited free database/authentication/inference. The current app uses none of those services. When online play is added, select and document backend quotas separately.

## Stockfish distribution

The generated engine directory includes its GPL license and corresponding-source links for the exact version. Keep those files with deployments and review the upstream redistribution requirements if you modify or redistribute an engine build. The app's existing MIT license is retained for original application code; third-party licenses remain separate.
