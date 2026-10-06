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

File letters still use phonetic spellings such as “ay” to avoid the unstressed word “a”. Output now speaks the file segment, waits 160 ms after it finishes, then speaks the rank segment. Thus `a4` is “ay … four”. Voice quality and any additional pauses depend on the installed system voice. Muting or replacing an announcement cancels its remaining segments.

Whisper is hosted entirely on the same origin: [the model publisher](https://huggingface.co/onnx-community/whisper-tiny.en) supplies the ONNX conversion, and the adapter follows [Transformers.js local-model/runtime configuration](https://huggingface.co/docs/transformers.js/en/custom_usage). Remote model loading is disabled. `scripts/whisper-checksums.json` pins the model revision and hashes; browser downloads verify every part and assembled file. Future model/runtime updates must change the cache version together with the asset URLs or explicitly invalidate the pack.
