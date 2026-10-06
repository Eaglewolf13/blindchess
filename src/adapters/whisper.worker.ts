import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

// All models and runtime files come from our verified offline pack. No remote fallbacks.
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = '/models/';
env.useBrowserCache = false;
env.backends.onnx.wasm!.wasmPaths = '/models/whisper-runtime/';
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.proxy = false;
let transcriber: AutomaticSpeechRecognitionPipeline;
// Narrow the library's large task union before calling it (avoids TS2590).
const createTranscriber = pipeline as unknown as (
  task: 'automatic-speech-recognition',
  model: string,
  options: { device: 'wasm'; dtype: 'q8' },
) => Promise<AutomaticSpeechRecognitionPipeline>;
self.onmessage = async ({
  data,
}: MessageEvent<{ type: 'load' | 'audio'; samples?: Float32Array; rate?: number }>) => {
  try {
    if (data.type === 'load') {
      transcriber = await createTranscriber('automatic-speech-recognition', 'whisper-tiny.en', {
        device: 'wasm',
        dtype: 'q8',
      });
      self.postMessage({ type: 'ready' });
      return;
    }
    const started = performance.now();
    const samples = data.samples!;
    const ratio = data.rate! / 16000;
    const audio = new Float32Array(Math.floor(samples.length / ratio));
    // Average source samples when downsampling, to attenuate high-frequency noise.
    for (let i = 0; i < audio.length; i++) {
      const from = Math.floor(i * ratio),
        to = Math.min(samples.length, Math.max(from + 1, Math.floor((i + 1) * ratio)));
      let sum = 0;
      for (let j = from; j < to; j++) sum += samples[j];
      audio[i] = sum / (to - from);
    }
    const result = await transcriber(audio, { max_new_tokens: 64, do_sample: false });
    self.postMessage({
      type: 'result',
      text: (Array.isArray(result) ? result[0] : result).text.trim(),
      elapsed: Math.round(performance.now() - started),
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
