import { speechVocabulary } from '../domain/commands';
import type { SpeechInput, SpeechOutput } from '../ports';
import { speechModelUrl, RECOGNIZERS } from './offline';
import type { Model, KaldiRecognizer } from 'vosk-browser';
import type { Settings } from '../domain/types';
import { pronunciationText, rejectionReason, UtteranceBuffer } from './voice-utils';

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
    const utterance = new SpeechSynthesisUtterance(pronunciationText(text));
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
export interface VoiceEvent {
  id: number;
  time: string;
  recognizer: string;
  text: string;
  detail: string;
  words?: { word: string; conf: number }[];
}
export interface VoiceSnapshot {
  level: number;
  partial: string;
  status: string;
  events: VoiceEvent[];
}
export class LocalSpeechInput implements SpeechInput {
  private snapshot: VoiceSnapshot = {
    level: 0,
    partial: '',
    status: 'Microphone paused.',
    events: [],
  };
  private listeners = new Set<() => void>();
  private eventId = 0;
  private recognizerName = '';
  private whisper: Worker | null = null;
  private whisperBusy = false;
  private whisperTimer: ReturnType<typeof setTimeout> | undefined;
  private cancelLoad: (() => void) | null = null;
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<VoiceSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private log(text: string, detail: string, words?: VoiceEvent['words']) {
    this.update({
      events: [
        {
          id: ++this.eventId,
          time: new Date().toLocaleTimeString(),
          recognizer: this.recognizerName,
          text,
          detail,
          words,
        },
        ...this.snapshot.events,
      ].slice(0, 60),
    });
  }
  clear = () => this.update({ events: [], partial: '' });
  private model: Model | null = null;
  private recognizer: KaldiRecognizer | null = null;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private capture: AudioWorkletNode | null = null;
  private generation = 0;
  constructor(private readonly output: BrowserSpeechOutput) {}

  async start(
    onText: (text: string) => Promise<string>,
    onStatus: (status: string) => void,
    options: Pick<Settings, 'speechRecognizer' | 'voiceConfidence'>,
  ): Promise<void> {
    await this.stop();
    const generation = ++this.generation;
    this.recognizerName = RECOGNIZERS[options.speechRecognizer].label;
    const status = (text: string) => {
      if (generation !== this.generation) return;
      this.update({ status: text });
      if (/stopped|disconnected|suspended/i.test(text)) this.log('', text);
      onStatus(text);
    };
    const received = async (text: string, words?: VoiceEvent['words'], elapsed?: number) => {
      if (generation !== this.generation) return;
      this.update({ partial: '' });
      const reason = rejectionReason(text, words ?? [], options.voiceConfidence);
      if (reason) {
        if (text) {
          this.log(text, reason, words);
          status(`Heard “${text}”. ${reason}`);
        }
        if (/^apex\b/i.test(text))
          this.output.say('Command unclear. Please repeat the whole command.');
        if (!text && elapsed !== undefined) {
          this.log('', 'Speech was detected, but Whisper returned no words.');
          status('No words recognized. Try speaking a little closer to the microphone.');
        }
        return;
      }
      const result = await onText(text);
      if (generation !== this.generation) return;
      this.log(
        text,
        result + (elapsed !== undefined ? ` Transcription: ${(elapsed / 1000).toFixed(1)} s.` : ''),
        words,
      );
      status(`Heard “${text}”. ${result}`);
    };
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
      status('Loading local voice model…');
      const context = this.context;
      if (options.speechRecognizer === 'whisper') {
        await speechModelUrl('whisper');
        const worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), {
          type: 'module',
        });
        this.whisper = worker;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('Whisper took too long to load. Try Vosk on this device.')),
            90000,
          );
          this.cancelLoad = () => {
            clearTimeout(timer);
            reject(new Error('Voice startup cancelled.'));
          };
          worker.onmessage = ({ data }) => {
            if (generation !== this.generation) return;
            if (data.type === 'ready') {
              clearTimeout(timer);
              this.cancelLoad = null;
              resolve();
            } else if (data.type === 'result') {
              clearTimeout(this.whisperTimer);
              this.whisperBusy = false;
              void received(data.text, undefined, data.elapsed);
            } else if (data.type === 'error') {
              clearTimeout(timer);
              clearTimeout(this.whisperTimer);
              reject(new Error(data.error));
              status(`Voice input stopped: ${data.error}`);
              void this.stop();
            }
          };
          worker.onerror = () => {
            clearTimeout(timer);
            reject(new Error('Whisper worker failed. Try Vosk or download the pack again.'));
            status('Voice input stopped: Whisper worker failed.');
            void this.stop();
          };
          worker.postMessage({ type: 'load' });
        });
      } else {
        const { Model } = await import('vosk-browser');
        const model = new Model(await speechModelUrl(), -1);
        this.model = model;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('The voice model took too long to load. Please try again.')),
            60000,
          );
          this.cancelLoad = () => {
            clearTimeout(timer);
            reject(new Error('Voice startup cancelled.'));
          };
          model.on('load', (message) => {
            clearTimeout(timer);
            this.cancelLoad = null;
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
        const recognizer =
          options.speechRecognizer === 'vosk-open'
            ? new model.KaldiRecognizer(context.sampleRate)
            : new model.KaldiRecognizer(context.sampleRate, JSON.stringify(speechVocabulary()));
        this.recognizer = recognizer;
        recognizer.setWords(true);
        recognizer.on('result', (message) => {
          if (generation !== this.generation || message.event !== 'result') return;
          const text = message.result.text.trim();
          const words = message.result.result ?? [];
          void received(text, words);
        });
        recognizer.on('partialresult', (message) => {
          if (
            generation === this.generation &&
            message.event === 'partialresult' &&
            message.result.partial !== this.snapshot.partial
          )
            this.update({ partial: message.result.partial });
        });
        recognizer.on('error', () => {
          status('Voice input stopped. Try enabling the microphone again.');
          void this.stop();
        });
      }
      if (generation !== this.generation || !this.stream) return;
      await context.audioWorklet.addModule('/audio-capture.js');
      if (generation !== this.generation || !this.stream) return;
      this.capture = new AudioWorkletNode(context, 'apex-capture');
      let buffer = new Float32Array(4096),
        offset = 0;
      const utterance = new UtteranceBuffer(context.sampleRate);
      let lastMeter = 0,
        wasSpeaking = false;
      this.capture.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
        if (generation !== this.generation) return;
        // Feed silence while the app speaks so it cannot execute its own announcements.
        const speaking = this.output.speaking;
        const rms = Math.sqrt(data.reduce((sum, sample) => sum + sample * sample, 0) / data.length);
        if (performance.now() - lastMeter > 100) {
          lastMeter = performance.now();
          this.update({ level: Math.min(1, rms * 8) });
        }
        if (speaking !== wasSpeaking) {
          wasSpeaking = speaking;
          status(
            speaking
              ? 'Announcement playing; voice input resumes when it finishes.'
              : 'Listening. Say “apex” and the command together.',
          );
          if (speaking) {
            this.log('', 'Input suppressed during spoken announcement (echo protection).');
            utterance.reset();
          }
        }
        const samples = speaking ? new Float32Array(data.length) : data;
        if (this.whisper) {
          if (speaking || this.whisperBusy) {
            utterance.reset();
            return;
          }
          const audio = utterance.push(data, rms);
          if (audio) {
            this.whisperBusy = true;
            status('Transcribing locally. Please wait before the next command.');
            this.whisperTimer = setTimeout(() => {
              status('Voice input stopped: transcription took too long. Try Vosk on this device.');
              void this.stop();
            }, 60000);
            this.whisper.postMessage({ type: 'audio', samples: audio, rate: context.sampleRate }, [
              audio.buffer,
            ]);
          }
          return;
        }
        for (const sample of samples) {
          buffer[offset++] = sample;
          if (offset === buffer.length) {
            this.recognizer?.acceptWaveformFloat(buffer, context.sampleRate);
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
        status(
          context.state === 'running'
            ? 'Listening for “apex”…'
            : 'Microphone suspended. Return to the app and enable it again.',
        );
        if (context.state !== 'running') void this.stop();
      };
      this.stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (generation === this.generation) {
            status('Microphone disconnected. Enable it again to reconnect.');
            void this.stop();
          }
        };
      });
      status('Listening. Say “apex” and the command together.');
    } catch (error) {
      this.log('', error instanceof Error ? error.message : 'Voice startup failed.');
      await this.stop();
      throw error;
    }
  }
  async stop() {
    ++this.generation;
    const cancelLoad = this.cancelLoad;
    this.cancelLoad = null;
    cancelLoad?.();
    clearTimeout(this.whisperTimer);
    this.whisper?.terminate();
    this.whisper = null;
    this.whisperBusy = false;
    this.update({ level: 0, partial: '', status: 'Microphone paused.' });
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
