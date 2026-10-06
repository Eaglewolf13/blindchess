# Apex · Blindfold chess

An installable, offline chess practice app. Play both sides or a local Stockfish engine using English voice commands, a keyboard, or legal-move selectors. Games save automatically on your device.

## Run it

Use Node.js **24 LTS** (or a supported Node release accepted by Vite).

```sh
npm ci
npm run assets
npm run dev
```

Open the localhost URL printed in the terminal. `npm run assets` prepares Stockfish, the **39.8 MiB Vosk** English model, and a **62.2 MiB Whisper tiny.en pack** including its WASM runtime. Downloads are pinned and checksum-verified. Models are split into files under 25 MiB for inexpensive static hosting. The running app makes no third-party model requests; players download only the packs they choose.

On this Windows workspace, a portable Node installation is also available in the **parent folder's `.tools` directory**. The supplied runner discovers it, without changing your system PATH:

```powershell
.\scripts\run.ps1 dev
```

Open **this directory** (`blindchess/blindchess`, containing `package.json`) as the VS Code workspace. The included VS Code tasks run development, checks, and a production preview. The portable toolchain is machine-local and is not part of the Git repository.

## First session

1. Start in **Self play**, or choose **New game → Play Stockfish**. Choose your side and level 1–8.
2. Use the Piece / From / To selectors, or type `move pawn e2 e4` in the command bar.
3. For voice, select **Enable microphone**, download the voice pack, then select **Enable microphone** again and allow browser access. Say **“apex move pawn e two e four”**. You can pause between required parts; an unfinished command stays visible until you complete or cancel it.
4. The microphone keeps listening while the app is active. The microphone button pauses/resumes it. The speaker button separately mutes announcements.
5. Games save after every move. **My games** opens them for visual or spoken review and PGN export. Resume with **Resume game** or **“apex resume game.”** The trash button deletes an individual game after confirmation, with an option to export first.
6. Missed an announcement? Say **“apex last move”** or select **Repeat last move**. It repeats the latest actual move in the open game, its color, and the next turn. In review it still refers to the live game and tells you that review is active.

## Comparing voice recognition

Open **Settings → Voice recognition**. Choose **Vosk · chess vocabulary** (default), **Vosk · general English** (same pack), or **Whisper · tiny English** (separate pack). Switching pauses the microphone; download the selected pack if needed, then choose **Start voice test**. All three run locally, including offline after preparation.

Enable **Voice debug mode** to see microphone level, Vosk draft transcripts, final transcripts, each provider's name, Vosk word scores, and the command decision. A draft never executes a command. Whisper reports completed transcripts and processing time, not invented confidence scores. Logs contain at most 60 events, stay in memory, and can be cleared; no microphone audio is saved. See [voice testing](docs/VOICE.md) for interpretation and comparison steps.

Both alternatives are experimental, not promised accuracy upgrades. General English can mishear square names; Whisper tiny can merge words or omit squares. Neither is allowed to guess a missing piece/square. Whisper waits for about 0.9 seconds of silence, processes one utterance at a time, and asks you to wait during transcription. The microphone stays open, but speech during transcription or spoken announcements is not accepted. Muting spoken responses removes announcement pauses. Actual accuracy depends on your voice and device.

Browser permissions require a deliberate microphone activation. The app cannot silently enable your microphone on the first visit. On mobile, keep the app in the foreground; locking the device or switching apps can suspend audio. The app reports suspension and offers reconnection.

## Commands

Spoken commands require the `apex` prefix by default. Typed commands accept it optionally.

| Command                                            | Behavior                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `apex move knight g one f three`                   | Validate and play a move; normal captures and check detection are automatic.            |
| `apex move king e one g one`                       | Castle kingside when legal. The rook moves automatically.                               |
| `apex move pawn a seven a eight promote to knight` | Underpromote. Omitting the promotion piece defaults to queen.                           |
| `apex vision e four`                               | Describe a square in the live or reviewed position.                                     |
| `apex review`                                      | Announce White's first move and enter review.                                           |
| `apex review ten`                                  | Announce White's tenth move.                                                            |
| `apex next`                                        | Advance one individual move (one ply).                                                  |
| `apex next three`                                  | Advance three plies, then announce the resulting move.                                  |
| `apex resume game`                                 | Exit review and resume the latest position.                                             |
| `apex last move`                                   | Repeat the open game's latest move, color, and next turn (or game result).              |
| `apex current eval`                                | Evaluate the displayed position at maximum local engine skill.                          |
| `apex new game self`                               | Start self play after the game ends, or from an untouched starting position.            |
| `apex new game engine three`                       | Start an engine game at level 3. Easy / medium / strong / full power are also accepted. |

Voice input finds **apex anywhere in a finalized transcript**, ignores earlier words, and fills the command's required slots in order. Unknown sounds, low-confidence words, and words that do not fit the next slot are skipped. For example, `apex move hello nice queen wrong what bishop c4 c5` becomes `move queen c4 c5`. Unfinished commands survive pauses with no timeout. Say **apex** again to restart, or select **Cancel pending command**. The first matching words fill each slot, so conversation after the wake word can contribute to a command. Changing the position, review position, or recognition settings clears unfinished input; spoken announcements also clear pending input for echo protection.

All three recognizers share this assembly step. It splits coordinates such as `a2a3` and accepts a small explicit list of aliases in the appropriate slots, including `bond` / `bon` / `on` for pawn and `moved` for move. It does not guess arbitrary missing words or use move legality to choose a transcription. The Vosk acoustic vocabulary is unchanged during a command; slot filtering happens after transcription. Typed commands still require a whole-command match.

Execution waits for a finalized speech segment, never a revisable draft. Include optional arguments in the same segment: bare `review`, `next`, and `new game engine` are already complete commands, and a move without a promotion suffix defaults to queen. Once complete, the normal command settings, turn checks, and chess rules apply.

The **Minimum Vosk word confidence** control (50% by default) is available with debug off and applies immediately. Lower values accept more uncertain words; changing the setting clears unfinished input. Audio is processed locally. Input is suppressed during narration to avoid feedback loops.

**Settings → Spoken pronunciation** offers a flowing sentence with capital file letters (default), or letters with adjustable gaps. Neither adds commas inside squares: `a2` becomes `A two`. In adjustable mode, separate sliders control the extra gap **before the letter** (0–600 ms) and **between letter and number** (0–300 ms). Both default to **0 ms**, which keeps the sentence together with natural spacing. Use **Test pronunciation** to compare `a2 → a4`, `bishop e3 → f2`, and `king f8 → d8` without changing a game. Positive gaps split speech into chunks and add to any pauses the system voice inserts. The phonetic option has been removed; a saved phonetic choice falls back to flowing letters. Existing saved gaps and voice choices are retained. An installed English voice picker remains available; no new model download is required. Screen text and PGN are unaffected.

Announcements play in order: **“Move made” finishes before a fast engine reply is read out**. The engine and board do not wait for narration. Mute, Stop test, changing pronunciation settings, game changes, and review navigation clear old speech. Starting a pronunciation test replaces the earlier test instead of adding repeated samples to the queue.

The spoken resume command is now `apex resume game`; the former `return to play` phrase remains a typed alias. The word `to` remains available for optional move connectors and promotions. Command assembly, recognition models, and confidence behavior are unchanged by this rename.

## Offline use and installation

Offline app caching is tested in the **production build**, not the development server:

```sh
npm run build
npm run preview
```

Or use `.\scripts\run.ps1 preview` on Windows; the runner builds first.

Open the preview URL and wait for **Settings → App & Stockfish → Ready offline**. Download the English voice pack and wait for **Downloaded**. You can then disconnect and reload, play against Stockfish, and review locally saved games. For offline narration, the OS also needs an installed English text-to-speech voice.

Use your browser's install option on desktop/Android. On iPhone/iPad, use Safari's **Share → Add to Home Screen**. Serve the app over HTTPS for microphone access outside localhost. Opening your PC's plain HTTP LAN address on a phone does not satisfy this requirement.

Browser storage can be cleared or evicted. Apex requests persistent storage when supported, but checks actual cached assets instead of promising permanent availability. Export important games as PGN. PWA updates are offered explicitly so a new version does not interrupt a session unexpectedly.

## Verification

```sh
npm run check        # Type checking + domain/application tests
npm run build        # Production bundle and service worker
npm run test:e2e     # Browser tests against the production preview
```

The browser tests default to an installed Google Chrome. Set `PLAYWRIGHT_CHANNEL=msedge` to use Edge. Tests cover real local Stockfish, offline reload, speech model caching, review, exports, disabled commands, and mobile layout. See [testing notes](docs/TESTING.md) for microphone and Apple-device verification.

## Structure and learning

Start with [the architecture walkthrough](docs/ARCHITECTURE.md), then read `src/domain/commands.ts` and `src/domain/game.ts`. They are deliberately separate from browser APIs. [The scope and roadmap](docs/ROADMAP.md) records the agreed offline-first release and the online features still to come.

```text
src/domain/         Chess rules, records, command grammar, review semantics
src/application/    Coordinates commands, saves, narration, and engine turns
src/ports/          Contracts for storage, speech, engines, and future networking
src/adapters/       IndexedDB, Stockfish worker, Vosk, speech output, offline packs
src/ui/             Board, move controls, library, settings, dialogs
scripts/            Repeatable asset setup and Windows development runner
tests/              Browser-level integration tests
docs/               Architecture, deployment, testing, and roadmap
```

## Current boundaries

- This release is **local practice**. Accounts, public game history, friends, invitations, and online games are planned, not simulated.
- The engine is **Stockfish 18 lite, single-threaded**. Level 8 means full skill of that bundled build with an approximately 800 ms search, not the full-size desktop build or unlimited analysis. Evaluation uses approximately 1,200 ms. A watchdog stops stalled searches. Initial engine/model loading is separate from move calculation.
- Levels 1–2 add deliberate legal mistakes to make the engine more approachable; levels are not advertised as Elo ratings.
- Claimable threefold and fifty-move draws end practice games automatically. Full tournament draw-claim policy is not implemented.
- The intended browser targets are current Chrome/Edge and Safari with AudioWorklet, WebAssembly, IndexedDB, and service workers. Apple microphone behavior and accuracy require testing on real Apple hardware; Chrome's mobile viewport is not an iPhone compatibility test.

## Hosting and licenses

The production `dist/` directory is a static site suitable for Cloudflare Pages and similar hosts. See [deployment instructions](docs/DEPLOYMENT.md). No paid API, cloud inference, or backend is needed for this version.

The original project code keeps the existing MIT license. Third-party components keep their own licenses, including Stockfish's GPL-3.0. See [third-party notices](THIRD_PARTY_NOTICES.md); engine license and corresponding-source links are shipped with the engine assets.
