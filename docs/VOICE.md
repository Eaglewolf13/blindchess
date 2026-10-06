# Testing your voice

1. In Settings, enable **Voice debug mode**, choose a recognizer, and prepare its pack. Start voice input with **Start voice test**. Keep “Require apex” enabled.
2. Try the same sentences at normal volume: “apex vision a three”, “apex last move”, and “apex move pawn e two to e four” in a fresh self-play game. A short pause between “pawn” and the origin can help; keep “apex” and the whole command in one utterance.
3. Wait briefly after the sentence. Vosk shows drafts as you speak; Whisper produces a transcript after about 0.9 seconds of silence. The model can take additional time to transcribe. Start another command once it has finished.
4. Inspect the final transcript and its decision. If it got the words wrong, compare another mode before changing the grammar or confidence threshold. If it got them right but rejected a legal command, save the transcript text to report a parser issue. No automatic recording or upload occurs.
5. Try background conversation as well as commands. Exact-command success alone is not enough: a recognizer should also avoid unintended moves.

## What the indicators mean

- **Microphone level**: a relative signal meter, not calibrated decibels. A flat meter while speaking suggests permission, the wrong device, or a disconnected microphone. Whisper's simple speech detector has a fixed energy threshold; a very quiet voice may not start an utterance even if the meter moves slightly.
- **In progress**: Vosk's changing guess. Partial text is never sent to the chess controller. Whisper has no partial transcript in this implementation.
- **Word scores**: Vosk's estimates, not a probability that the command is correct. Any word below the configured minimum rejects the whole utterance. The 50% default is retained; pause the microphone to adjust it. Values cannot be compared against Whisper.
- **Unknown word / `[unk]`**: restricted Vosk heard something outside its vocabulary. It does not remove the unknown word and execute the remainder.
- **No complete command / no wake word**: text did not match the entire supported grammar. The app does not search a conversation for a command or infer missing squares.
- **Command disabled / review mode / illegal move**: transcription reached the controller, which refused that action for the stated reason.
- **Announcement playing**: echo protection suppresses recognition while the app speaks and briefly afterward. Use the sound switch for uninterrupted Vosk input; headphones alone do not disable this guard.
- **Transcribing locally**: Whisper is processing one recorded utterance. New speech during that processing is discarded to prevent a queue of stale commands. Short commands are capped at 12 seconds, with a 60-second processing watchdog.

The log records the latest 60 events, tagged by recognizer. It survives mode switches for comparison and disappears on reload or Clear log. Audio exists only temporarily in memory for inference.

## Model choices

| Mode                    | Download       | Purpose and tradeoff                                                                                                |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Vosk · chess vocabulary | 39.8 MiB       | Current default. Fast streaming input, restricted words, per-word filtering.                                        |
| Vosk · general English  | Same Vosk pack | Diagnostic comparison with unrestricted words. Often less suited to coordinates.                                    |
| Whisper · tiny English  | 62.2 MiB       | Independent experimental model, quantized, single-threaded CPU WASM. More processing and no comparable word scores. |

This is not a benchmark. In local synthetic tests, restricted Vosk recognized the move fixture; unrestricted Vosk heard “pony to he for” and correctly triggered no move. Whisper heard “Pawnee 2e4” from that same connected sentence and also triggered no move. Its separate last-move fixture tests successful command handling. Test your own voice before choosing a default. Tiny Whisper is not the accuracy of larger Whisper models.

Whisper is hosted entirely on the same origin: [the model publisher](https://huggingface.co/onnx-community/whisper-tiny.en) supplies the ONNX conversion, and the adapter follows [Transformers.js local-model/runtime configuration](https://huggingface.co/docs/transformers.js/en/custom_usage). Remote model loading is disabled. `scripts/whisper-checksums.json` pins the model revision and hashes; browser downloads verify every part and assembled file. Future model/runtime updates must change the cache version together with the asset URLs or explicitly invalidate the pack.
