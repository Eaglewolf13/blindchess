# Testing your voice

1. In Settings, enable **Voice debug mode**, choose a recognizer, and prepare its pack. Start voice input with **Start voice test**. Keep “Require apex” enabled.
2. Try the same sentences at normal volume: “apex vision a three”, “apex last move”, and “apex move pawn e two to e four” in a fresh self-play game. Then try “apex move pawn e two”, pause for several seconds, and finish with “e four”. The unfinished command and next expected part appear even with debug off.
3. Try saying other words before “apex”. Only words after the wake word contribute. Within a command, unknown sounds and words that do not fit the expected slot are skipped. Say “apex” again to start over, or select **Cancel pending command**. Silence alone never cancels an unfinished command.
4. Wait briefly after the sentence. Vosk shows changing drafts; only finalized segments advance the command. Whisper transcribes after about 0.9 seconds of silence and does not accept new speech while processing. For Whisper, wait for transcription before continuing a paused command. Neither mode executes revisable draft text.
5. Inspect the final transcript, accepted prefix, skipped words, and controller decision. If the model got words wrong, compare another mode or adjust **Minimum Vosk word confidence** in Settings. That control works with debug off, applies immediately, and persists across reloads. Changing it clears unfinished input. No automatic recording or upload occurs.
6. Try background conversation as well as commands. After “apex”, the first matching words fill each slot, so subsequent conversation can contribute to an action. Restart or cancel if you change your mind. A quoted valid command can execute too; the app cannot recognize your intention.

## How commands are assembled

For `apex move hello nice queen wrong what bishop c4 c5`, the app accepts **move**, waits through **hello nice**, accepts **queen**, waits through **wrong what bishop**, and accepts **c4 c5**. Bishop is a known word but cannot fill a square slot. The resulting queen move still has to pass the ordinary turn, command-permission, and chess-rule checks.

Coordinates such as `a2a3` are split into squares. Explicit aliases cover common reported transcriptions: `moved` for move; `bond`, `bon`, or `on` for pawn; `night` for knight; and `to` / `for` for ranks two / four. Aliases only apply in their respective slots. Arbitrary fuzzy matching and legality-based guesses are not used. “Next” does not become “apex”: if the model misses the wake word, repeat it.

This constrains **accepted words after transcription**. Vosk's acoustic vocabulary stays fixed for the selected mode; it is not switched after each word. All three recognizers share the assembler. Better parsing can recover a transcript with known aliases or extra words, but it cannot recover speech the model never detected.

Include optional arguments in the same speech segment. A bare `review` or `next` is already complete and executes at the next segment boundary; a number spoken afterward cannot change it. Similarly, an engine game without a level uses its default and a promotion move without a suffix becomes a queen. Saying `promote` before pausing keeps the promotion-piece slot open.

Stopping the microphone, changing the position or review position, switching recognizers, changing wake-word/confidence settings, or a spoken announcement clears unfinished input. This keeps a command captured for an earlier position from executing later. Noise and pauses by themselves leave it intact.

## What the indicators mean

- **Microphone level**: a relative signal meter, not calibrated decibels. A flat meter while speaking suggests permission, the wrong device, or a disconnected microphone. Whisper's simple speech detector has a fixed energy threshold; a very quiet voice may not start an utterance even if the meter moves slightly.
- **In progress**: Vosk's changing guess. Partial text is never sent to the chess controller. Whisper has no partial transcript in this implementation.
- **Word scores**: Vosk's estimates, not a probability that the command is correct. Below-threshold words are skipped while the same slot keeps waiting. Words before “apex” do not matter. An uncertain “apex” clears any old chain but does not start a new one. The 50% default is retained; values cannot be compared against Whisper.
- **Unknown word / `[unk]`**: restricted Vosk heard something outside its vocabulary. Unknown words are skipped, and valid words later in that segment can still complete the command.
- **Waiting for…**: the accepted prefix is incomplete. Continue with the displayed next part or repeat “apex” to restart. Incomplete input is not announced aloud because narration would interrupt the continuation.
- **Ignored: waiting for apex**: no chain is active and no wake word was recognized. Words before a later wake word are ignored.
- **Mapped / skipped / assembled**: the log distinguishes raw transcription, contextual aliases, ignored words, and the complete command sent to the controller.
- **Command disabled / review mode / illegal move**: transcription reached the controller, which refused that action for the stated reason.
- **Announcement playing**: echo protection suppresses recognition while the app speaks and briefly afterward. Use the sound switch for uninterrupted Vosk input; headphones alone do not disable this guard.
- **Transcribing locally**: Whisper is processing one recorded utterance. New speech during that processing is discarded to prevent a queue of stale commands. Short commands are capped at 12 seconds, with a 60-second processing watchdog.

The log records the latest 60 events, tagged by recognizer. It survives mode switches for comparison and disappears on reload or Clear log. Audio exists only temporarily in memory for inference.

## Model choices

| Mode                    | Download       | Purpose and tradeoff                                                                                                |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Vosk · chess vocabulary | 39.8 MiB       | Current default. Streaming transcription, restricted vocabulary, and word scores.                                   |
| Vosk · general English  | Same Vosk pack | Diagnostic comparison with unrestricted words. Often less suited to coordinates.                                    |
| Whisper · tiny English  | 62.2 MiB       | Independent experimental model, quantized, single-threaded CPU WASM. More processing and no comparable word scores. |

This is not a benchmark. In local synthetic tests, restricted Vosk recognizes a move and a second recording with background words before “apex” and a 4.5-second pause after the origin square. Unrestricted Vosk hears “pony to he for” and leaves an unfinished command without playing a move. Whisper's separate last-move fixture tests successful command handling; earlier testing of the connected move sentence produced “Pawnee 2e4”, which these explicit aliases do not fix. Test your own voice before choosing a mode. Tiny Whisper is not the accuracy of larger Whisper models.

The Vosk model and default confidence have not changed in this update. The preceding update expanded its vocabulary for the new commands and removed a check that discarded finalized results just because an announcement had begun while the result was in flight. Capture remains suppressed during narration. Those changes may affect observed behavior, but the synthetic tests cannot explain a change in human recognition accuracy.

## Spoken square names

Open **Settings → Spoken pronunciation**. These controls are available with debug off, save across reloads, and affect output only. **Test pronunciation** reads the reported problem cases without changing the board. Enable Spoken responses to hear it; **Stop test** cancels the announcement.

| Option                                   | Behavior                                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Letters · flowing sentence** (default) | Sends one sentence such as `Black played bishop E three to F two.` to the system voice, with no added timers or commas inside squares.  |
| **Letters · adjustable gaps**            | Separately controls the gap before the letter (`pawn → A`, `to → A`) and between letter and number (`A → two`). No commas are inserted. |

Start adjustable mode with **100 ms before the letter** and **0 ms between letter and number**. The sliders allow 0–600 ms before the letter and 0–300 ms between letter and number. For `pawn a2 to a4`, this speaks `Pawn`, waits, speaks `A two to`, waits, then speaks `A four`. A positive letter–number gap instead gives the letter its own chunk, followed by the chosen wait before the rank. These are independent controls; adjust one at a time and replay the test.

**Zero joins the text into one speech chunk at that boundary.** It does not merely schedule the next chunk immediately. That avoids an additional synthesis restart between `A` and `two` when their gap is zero. With both sliders at zero, the entire announcement is one chunk. Natural word spacing and original punctuation remain voice-dependent.

A positive extra gap is **not the total audible pause**: the system voice can add tail silence or startup delay to separate chunks. The earlier adjustable mode already used no inserted commas; its large pauses could come from those chunk boundaries. The flowing mode previously inserted commas, which have now been removed. Pronunciation, especially `A`, still needs listening tests with your installed voice.

The phonetic method has been removed following listening feedback. Saved phonetic selections automatically become flowing letters. Existing gap values and the installed-voice choice are retained; missing before-letter settings default to 100 ms. New installations default to a zero letter–number gap.

**Installed English voice** lists only voices the browser reports as local. Its list updates when the browser makes voices available. An unavailable saved choice falls back to another local English voice. If none is reported, Automatic leaves the voice choice to the browser; install an English system voice for offline narration. No replacement read-aloud model is bundled. The [Web Speech API specification](https://webaudio.github.io/web-speech-api/#speechsynthesisvoice) defines this local/remote distinction and lets engines vary in their support for pronunciation markup, so this implementation uses plain text rather than relying on SSML support.

Changing pronunciation settings, muting, stopping, or replacing an announcement cancels remaining chunks. Duplicate or stale end callbacks cannot queue a rank twice. Echo protection stays active across deliberate gaps. Screen text and exported PGN keep the original coordinates.

## Resuming a game

Say **apex resume game** to leave review at the latest position. This replaces the spoken `return to play` phrase, avoiding a required `to` in that command. `Return to play` is retained as a typed alias only. The recognizer still includes `to` for optional move connectors and promotion phrases; the successful slot assembly behavior is unchanged.

Whisper is hosted entirely on the same origin: [the model publisher](https://huggingface.co/onnx-community/whisper-tiny.en) supplies the ONNX conversion, and the adapter follows [Transformers.js local-model/runtime configuration](https://huggingface.co/docs/transformers.js/en/custom_usage). Remote model loading is disabled. `scripts/whisper-checksums.json` pins the model revision and hashes; browser downloads verify every part and assembled file. Future model/runtime updates must change the cache version together with the asset URLs or explicitly invalidate the pack.
