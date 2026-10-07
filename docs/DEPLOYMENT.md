# Deploy as a static website

Build `dist/` and serve it over HTTPS. Cloudflare Pages hosts the app; Firebase Authentication and Firestore Standard provide accounts and public practice history. Guest play, Stockfish, and voice recognition remain local. No Cloud Functions, Cloud Storage bucket, or billing account is needed for this release within free quotas. A custom domain is optional.

## Firebase setup

Project: **apex-blind-chess**. The public web configuration is in `src/adapters/firebase.ts`; access is enforced by `firestore.rules`, not by hiding the API key. Never put an admin/service-account key in the client or its build variables.

1. In [Authentication](https://console.firebase.google.com/project/apex-blind-chess/authentication), choose **Get started → Sign-in method → Email/Password → Enable → Save**. Leave passwordless email links off. Google sign-in and the Identity Platform upgrade are optional and unused.
2. In [Firestore](https://console.firebase.google.com/project/apex-blind-chess/firestore), create a **Standard edition** database with ID **(default)**, location **europe-west3 (Frankfurt)**, and **production mode**. Skip optional scheduled backups/Blaze. Use the existing database if already created.
3. Open the Firestore **Rules** tab (**Regras** in Portuguese). Replace the editor contents with the complete contents of **`firestore.rules`** from this repository, then click **Publish** (**Publicar**). These rules allow public history/profile reads and owner-only changes. Everything else stays closed.
4. Leave the data tab empty; the app creates records after signup/play. Do not enable unrestricted test-mode access.

Alternatively, sign into the CLI with `npx firebase login`, then run `npx firebase deploy --only firestore --project apex-blind-chess` from this directory. That also deploys `firestore.indexes.json`, which disables unnecessary indexing of nested game data. The owner filter uses the automatic `ownerId` index; no composite index is needed. The exemption can be added later if rules are deployed through the console.

## Cloudflare Pages

1. Push this repository to your GitHub account when you are ready to publish it.
2. In Cloudflare, choose **Workers & Pages → Create application → Pages → Connect to Git**. The Pages option may appear as **Get started**. Connect GitHub, authorize access, and select **Eaglewolf13/blindchess**. Use project name **apex-blind-chess** if available and production branch **main**.
3. Framework preset: **None**. Add environment variable **NODE_VERSION = 24**. Leave **Root directory blank**: this Git repository starts at `package.json`, even though the PC has an extra enclosing folder. Do not set `VITE_FIREBASE_EMULATORS` in Cloudflare.
4. Use build command `npm ci && npm run assets && npm run build` and output directory `dist`.
5. Select **Save and Deploy** and wait for the first asset downloads/build. Copy the HTTPS production link. Later pushes to the connected branch can deploy automatically.
6. In Firebase **Authentication → Settings → Authorized domains**, add the actual hostname, e.g. **apex-blind-chess.pages.dev**, without `https://` or a path. Keep Firebase's existing domains. For local account development, explicitly add `localhost` and/or `127.0.0.1`; new projects do not include localhost automatically.
7. Verify microphone access, offline readiness, an engine move, and a voice command on the actual link, including on a real phone.

The code changes must be pushed before that initial deployment: an older Git commit will not include accounts. No purchased domain is required.

Both English models are downloaded at build time from their upstream publishers. Cache `.asset-cache` in CI if supported. Do not commit expanded dependencies or model files. Vosk is pinned by `scripts/model-checksum.json`; Whisper's repository revision and file hashes are pinned by `scripts/whisper-checksums.json`.

The model's two `.bin` files are below Cloudflare Pages' 25 MiB per-file limit. Stockfish uses a 7 MB single-threaded build, so cross-origin-isolation headers and SharedArrayBuffer are not required. Large model parts are fetched only when a user asks to prepare voice, then assembled locally. The Vosk virtual archive URL is served from Cache Storage by the service worker.

Whisper's files are similarly split into 20 MiB parts and reassembled in a separate cache. The service worker serves its JSON, ONNX, and runtime resources under `/models/whisper-tiny.en/` and `/models/whisper-runtime/`, including correct JavaScript and WASM MIME types. Do not replace these virtual paths with an HTML fallback. Whisper uses one WASM thread and requires no external inference API.

Keep `public/_headers` in the build: it configures long-lived hashed assets, fresh service-worker/manifest requests, MIME sniffing protection, and microphone access for the same origin. Other hosting providers may need equivalent header configuration.

## Verify an update

- Build and run `npm run test:e2e` before uploading.
- Confirm that a returning user receives an update prompt.
- Apply the update after a move is saved; check that saved games and preferences remain.
- Download voice, close and reopen the installed app in airplane mode, and check both speech recognition and spoken output.

Free hosting/authentication/database plans have quotas. Engine and speech processing run on the device and do not use a cloud inference service. Friend play will require a separate server-authoritative API, not unrestricted writes to practice histories.

## Account and offline checks

- Create an account, play a move, and wait for **History synced**. On another device, sign into that account and open its history from **My games**. Account histories/usernames are public; emails stay in Firebase Authentication.
- Guest games use tab-local sessionStorage, survive reloads, and are never assigned to an account on login. Closing the tab may discard them. Old localhost testing histories are intentionally not imported.
- Sign into the desired account before going offline and let history sync. Wait for **App & Stockfish: Ready offline** and download the selected voice pack. **Protect offline downloads** asks the browser for persistent storage; granting it is the browser's decision.
- Disconnect, reload, review and play. Account games save in an IndexedDB outbox and upload after reconnection. Creating an account or signing in anew requires a connection. Pending changes left at logout upload when that account signs in again on the same device.
- Check that deletions propagate and that conflicting offline continuations are retained as separate games. A deleted history stays deleted even if another device has a stale copy.
- Browser storage can be cleared or evicted. Persistent storage is not a backup guarantee. Export unsynced games before clearing site data. Native iPhone/iPad audio requires real-device checks beyond the automated WebKit tests.

## Backups on your PC

Firebase's managed Firestore export/import and scheduled backups require billing/Blaze. A custom local exporter could instead read `games`, `profiles`, and `usernames` and save JSON, using normal read quotas. It would need pagination, document IDs/schema versions, error checking, and a tested restore path; a download is not an atomic snapshot if games change during it. This optional whole-database exporter is not implemented yet. Individual games already export as PGN.

Login accounts are separate: an owner can use `npx firebase auth:export <private-file.json> --format=json --project apex-blind-chess` after CLI login. Full recovery also needs the password-hash configuration/permissions and a tested restore procedure. Keep those exports private and outside Git; public game-data exports do not back up logins. Code, rules, and indexes are versioned separately in this repository.

References: [managed exports](https://firebase.google.com/docs/firestore/manage-data/export-import), [Auth export/import](https://firebase.google.com/docs/cli/auth), [pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/).

## Stockfish distribution

The generated engine directory includes its GPL license and corresponding-source links for the exact version. Keep those files with deployments and review the upstream redistribution requirements if you modify or redistribute an engine build. The app's existing MIT license is retained for original application code; third-party licenses remain separate.
