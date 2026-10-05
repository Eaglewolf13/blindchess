import { speechVocabulary } from '../domain/commands';
import type { SpeechInput, SpeechOutput } from '../ports';
import { speechModelUrl } from './offline';
import type { Model, KaldiRecognizer } from 'vosk-browser';

export class BrowserSpeechOutput implements SpeechOutput {
  private enabled = true;
  private muteUntil = 0;
  get speaking() {
    return (
      ('speechSynthesis' in window && speechSynthesis.speaking) ||
      performance.now() < this.muteUntil
    );
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }
  say(text: string) {
    if (!this.enabled || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.95;
    const voices = speechSynthesis.getVoices();
    // Prefer an installed voice so speech output also works offline.
    const local =
      voices.find((voice) => voice.localService && voice.lang === 'en-US') ??
      voices.find((voice) => voice.localService && voice.lang.startsWith('en'));
    if (local) utterance.voice = local;
    this.muteUntil = performance.now() + 250;
    utterance.onend = utterance.onerror = () => {
      this.muteUntil = performance.now() + 350;
    };
    speechSynthesis.speak(utterance);
  }
  stop() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.muteUntil = performance.now() + 350;
  }
}

/** Offline recognition in a worker; capture uses AudioWorklet (including Safari). */
export class VoskSpeechInput implements SpeechInput {
  private model: Model | null = null;
  private recognizer: KaldiRecognizer | null = null;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private capture: AudioWorkletNode | null = null;
  private generation = 0;
  constructor(private readonly output: BrowserSpeechOutput) {}

  async start(onText: (text: string) => void, onStatus: (status: string) => void): Promise<void> {
    await this.stop();
    const generation = ++this.generation;
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error('Microphone access requires HTTPS or localhost.');
    try {
      // Request capture directly from the user's click, before waiting for model loading.
      this.context = new AudioContext();
      await this.context.resume();
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
      if (generation !== this.generation) {
        this.stream.getTracks().forEach((track) => track.stop());
        return;
      }
      onStatus('Loading local voice model…');
      const { Model } = await import('vosk-browser');
      const model = new Model(await speechModelUrl(), -1);
      this.model = model;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('The voice model took too long to load. Please try again.')),
          60000,
        );
        model.on('load', (message) => {
          clearTimeout(timer);
          'result' in message && message.result
            ? resolve()
            : reject(new Error('The voice model could not load.'));
        });
        model.on('error', (message) => {
          clearTimeout(timer);
          reject(
            new Error(
              ('error' in message && message.error) ||
                'The voice model could not load. Try downloading the voice pack again.',
            ),
          );
        });
      });
      if (generation !== this.generation || !this.context || !this.stream) {
        model.terminate();
        return;
      }
      const context = this.context;
      const recognizer = new model.KaldiRecognizer(
        context.sampleRate,
        JSON.stringify(speechVocabulary()),
      );
      this.recognizer = recognizer;
      recognizer.setWords(true);
      recognizer.on('result', (message) => {
        if (generation !== this.generation || message.event !== 'result' || this.output.speaking)
          return;
        const text = message.result.text.trim();
        const words = message.result.result ?? [];
        if (!text || text.includes('[unk]') || words.some((word) => word.conf < 0.5)) return;
        onText(text);
      });
      recognizer.on('error', () => {
        onStatus('Voice input stopped. Try enabling the microphone again.');
        void this.stop();
      });
      await context.audioWorklet.addModule('/audio-capture.js');
      this.capture = new AudioWorkletNode(context, 'apex-capture');
      let buffer = new Float32Array(4096),
        offset = 0;
      this.capture.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
        if (generation !== this.generation) return;
        // Feed silence while the app speaks so it cannot execute its own announcements.
        const samples = this.output.speaking ? new Float32Array(data.length) : data;
        for (const sample of samples) {
          buffer[offset++] = sample;
          if (offset === buffer.length) {
            recognizer.acceptWaveformFloat(buffer, context.sampleRate);
            buffer = new Float32Array(4096);
            offset = 0;
          }
        }
      };
      this.source = context.createMediaStreamSource(this.stream);
      this.source.connect(this.capture);
      // Worklet outputs silence; connecting keeps Safari's processing graph active.
      this.capture.connect(context.destination);
      context.onstatechange = () => {
        if (generation !== this.generation) return;
        onStatus(
          context.state === 'running'
            ? 'Listening for “apex”…'
            : 'Microphone suspended. Return to the app and enable it again.',
        );
      };
      this.stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (generation === this.generation) {
            onStatus('Microphone disconnected. Enable it again to reconnect.');
            void this.stop();
          }
        };
      });
      onStatus('Listening for “apex”…');
    } catch (error) {
      await this.stop();
      throw error;
    }
  }
  async stop() {
    ++this.generation;
    this.capture?.disconnect();
    this.capture = null;
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recognizer?.remove();
    this.recognizer = null;
    if (this.model) {
      // vosk-browser 0.0.8's graceful terminate throws if model loading failed.
      // Stop its Worker directly to also release memory in that error case.
      const worker: unknown = Reflect.get(this.model, 'worker');
      if (worker instanceof Worker) worker.terminate();
      else if (this.model.ready) this.model.terminate();
      this.model = null;
    }
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') await context.close().catch(() => {});
  }
}
