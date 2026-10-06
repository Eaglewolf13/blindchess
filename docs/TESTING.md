# Testing

## Verified in this workspace · 6 October 2026

- TypeScript check and all **70 unit/application tests passed**, including slot assembly, cancellation of stale recognition results, live confidence settings, and narration timing.
- Production build passed, including a generated service worker with app, speech runtime, and Stockfish assets.
- All **10 Chrome integration tests passed**, covering offline play, both voice packs, resume/last-move commands, deletion, diagnostic settings, and three microphone modes. Restricted Vosk executes both a continuous move and a move split by a 4.5-second pause with preceding background words; general Vosk leaves its mistranscription unfinished without executing; Whisper executes a separate synthetic last-move command. These test integration, not human accuracy.
- All **6 WebKit integration tests passed** using the stopped-origin method explained below. These cover the new UI, deletion, and cached voice resources. With the generated WAV present, the Whisper pack test also runs actual WASM transcription in an offline Worker in both Chrome and WebKit.
- Desktop and 390-pixel mobile screenshots were inspected. Real iPhone/iPad microphone behavior, background interruptions, and human speech accuracy remain to be checked on devices.

## Automated checks

`npm run check` checks TypeScript and runs domain/application tests for parsing, wake-word behavior, illegal moves, promotions, castling, en passant, draw results, PGN round trips, review numbering, disabled commands, saved history, and stale engine responses.

`npm run build` creates the production app and offline service worker. `npm run test:e2e` then starts a localhost production preview with Playwright and an installed Chrome (or Edge via `PLAYWRIGHT_CHANNEL=msedge`). It uses isolated browser profiles and checks:

- Manual text and selector moves; saved history survives reload.
- Review starts at White's requested move and advances individual moves.
- PGN export and saved-game review.
- Disabled commands apply to UI and command text.
- A production app reloads while offline and a real Stockfish Worker makes a legal reply.
- A downloaded voice model remains available through the service worker offline.
- Mobile viewport layout has no horizontal overflow.

Screenshots and failures go in ignored `test-results/` and `playwright-report/`. Tests do not read your personal browser profile or microphone.

For the optional real audio-pipeline tests on Windows, first run `powershell -ExecutionPolicy Bypass -File scripts/generate-speech-fixture.ps1`. It uses an installed US English system voice to generate ignored WAV files, including a move split by 4.5 seconds of silence. Chrome supplies each file as a fake microphone. No actual microphone is recorded. Each test is skipped when its fixture is absent.

For a separate WebKit compatibility check, install `npx playwright install webkit` and run `npm run test:webkit`. This exercises the UI, engine, and service worker in WebKit; it does not claim to emulate iOS microphone hardware or OS permissions. This workspace's downloaded test browser lives at `../.tools/playwright`; set `PLAYWRIGHT_BROWSERS_PATH` to that absolute directory to use it.

The Windows WebKit build does not expose AudioContext. Its Whisper worker test receives PCM decoded by the test runner from the synthetic WAV. This verifies inference and offline loading in WebKit, not microphone capture. Chrome's four voice tests exercise AudioWorklet with a fake microphone. Browser trace outputs use sibling `test-results/chromium` and `test-results/webkit` directories so parallel runs cannot delete each other's traces.

**WebKit test limitation:** Playwright WebKit 2359 has an [upstream offline-emulation defect](https://github.com/microsoft/playwright/issues/42775) that rejects service-worker responses when `setOffline(true)` is used. The WebKit tests instead stop their own static origin server, verify that direct network requests fail, then require the same cached reload, engine, and model behavior. Chrome uses actual Playwright offline emulation. The WebKit result verifies operation without the origin server; it does not verify an iPhone's airplane-mode behavior.

## Dependency audit

Transformers.js is pinned to 3.8.1 for the tested runtime integration. Its Node-only `sharp` dependency is overridden to patched 0.35.4; image processing is not used by this application or its browser bundle. The final npm install audit reports the two existing moderate Vosk entries below, and no high-severity entries.

The test runner has been updated to a patched release. Two related moderate npm audit entries remain for `vosk-browser` and its pinned `uuid@9` dependency. The [upstream advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq) concerns v3/v5/v6 calls with caller-provided buffers. The inspected Vosk integration creates recognizer IDs using v4 without external buffers; Apex uses the platform's `crypto.randomUUID` for game IDs. Those vulnerable APIs are not called by this application. The warning is recorded rather than hidden with an override that would leave Vosk's prebundled copy unchanged. Reassess when updating the recognizer library.

## Real microphone acceptance checklist

Use the production preview locally or a deployed HTTPS site. Plain HTTP over a LAN is not sufficient for microphone access on a phone.

1. Download the English voice pack. Deny microphone permission once; verify the app explains how to recover. Allow it and enable listening.
2. Speak at normal pace: `apex move pawn e two e four`, `apex vision e four`, and `apex current eval`.
3. Verify that the app executes each utterance once, responds audibly, and does not interpret its own output as input.
4. With the wake word required and no command pending, speak ordinary conversation without “apex”; it should not move a piece. Then speak unrelated words before a full `apex` command and verify that the command works. After “apex”, conversation can fill matching slots; this is the selected permissive behavior, not intention detection.
5. Try knight/night, all eight files, all eight ranks, a castling move, and promotion.
6. Review from move 2, then say `next three`. Compare the resulting position with the move journal.
7. Mute spoken responses and confirm that voice input still works. Pause the microphone and confirm that it releases capture.
8. On iPhone/iPad: test Safari and the installed home-screen app, permission activation, screen locking, backgrounding, a phone interruption, Bluetooth/headphone changes, and recovery.
9. In airplane mode, reload and repeat an engine game, vision, review, and evaluation. Test narration with the selected installed system voice too.
10. Pause after the piece, between file and rank, and after the origin. Verify the accepted prefix stays visible. Insert unknown/wrong-slot words, then finish the missing parts. Repeat “apex” halfway through and verify only the new chain is used. Cancel a pending command and verify a delayed transcript cannot finish it.
11. Change Vosk confidence with debug off and the microphone active. Verify the new threshold applies and persists after reload. Listen for a distinct gap between each square's file and rank; mute mid-announcement and confirm no later segment resumes.

## Accuracy measurements

Before changing confidence thresholds or selecting a different model, collect a small consented command/noise fixture set. Track exact command accuracy (including both squares), accidental commands per hour, median/95th-percentile latency, and device/browser. Synthetic speech can verify the pipeline but cannot substitute for a user's accent, room noise, or microphone.
