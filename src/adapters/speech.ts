import { speechVocabulary } from '../domain/commands';
import type { SpeechInput, SpeechOutput } from '../ports';
import { speechModelUrl, RECOGNIZERS } from './offline';
import type { Model, KaldiRecognizer } from 'vosk-browser';
import { DEFAULT_SETTINGS, type Settings, type SpeechPreferences } from '../domain/types';
import { pronunciationSegments, UtteranceBuffer } from './voice-utils';
import { VoiceCommandAssembler } from '../domain/voice-command';

export class BrowserSpeechOutput implements SpeechOutput {
  private enabled = true;
  private muteUntil = 0;
  private sequence = 0;
  private active = false;
  private pauseTimer: ReturnType<typeof setTimeout> | undefined;
  // Keep the active utterance alive and make duplicate native callbacks harmless.
  private utterance: SpeechSynthesisUtterance | null = null;
  private preferences: SpeechPreferences = {
    speechPronunciation: DEFAULT_SETTINGS.speechPronunciation,
    speechGapMs: DEFAULT_SETTINGS.speechGapMs,
    speechVoice: DEFAULT_SETTINGS.speechVoice,
  };
  configure(preferences: SpeechPreferences) {
    const next: SpeechPreferences = {
      speechPronunciation: preferences.speechPronunciation,
      speechGapMs: Math.max(0, Math.min(300, preferences.speechGapMs)),
      speechVoice: preferences.speechVoice,
    };
    if (
      next.speechPronunciation !== this.preferences.speechPronunciation ||
      next.speechGapMs !== this.preferences.speechGapMs ||
      next.speechVoice !== this.preferences.speechVoice
    )
      this.stop();
    this.preferences = next;
  }
  get speaking() {
    return (
      this.active ||
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
    this.stop();
    const sequence = this.sequence;
    const { speechPronunciation, speechGapMs, speechVoice } = this.preferences;
    const segments = pronunciationSegments(text, speechPronunciation);
    const voices = localEnglishVoices();
    // Prefer an installed voice so speech output also works offline.
    const local =
      voices.find((voice) => voice.voiceURI === speechVoice) ??
      voices.find((voice) => voice.lang.toLowerCase() === 'en-us') ??
      voices[0];
    const speak = (index: number) => {
      if (sequence !== this.sequence) return;
      if (index >= segments.length) {
        this.active = false;
        this.muteUntil = performance.now() + 350;
        return;
      }
      this.active = true; // Includes the deliberate gap between file and rank.
      const utterance = new SpeechSynthesisUtterance(segments[index]);
      this.utterance = utterance;
      utterance.lang = local?.lang ?? 'en-US';
      utterance.rate = 0.95;
      if (local) utterance.voice = local;
      utterance.onend = () => {
        if (sequence !== this.sequence || this.utterance !== utterance) return;
        this.utterance = null;
        if (index + 1 === segments.length) speak(index + 1);
        else this.pauseTimer = setTimeout(() => speak(index + 1), speechGapMs);
      };
      utterance.onerror = () => {
        if (sequence === this.sequence && this.utterance === utterance) this.stop();
      };
      speechSynthesis.speak(utterance);
    };
    speak(0);
  }
  stop() {
    ++this.sequence;
    clearTimeout(this.pauseTimer);
    this.active = false;
    this.utterance = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.muteUntil = performance.now() + 350;
  }
}

/** Only installed English voices are offered; no remote voice is selected by this picker. */
export function localEnglishVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return [];
  return speechSynthesis
    .getVoices()
    .filter((voice) => voice.localService && /^en(?:-|$)/i.test(voice.lang));
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
  pending: string;
  expected: string[];
  events: VoiceEvent[];
}
export class LocalSpeechInput implements SpeechInput {
  private snapshot: VoiceSnapshot = {
    level: 0,
    partial: '',
    status: 'Microphone paused.',
    pending: '',
    expected: [],
    events: [],
  };
  private listeners = new Set<() => void>();
  private eventId = 0;
  private recognizerName = '';
  private whisper: Worker | null = null;
  private whisperBusy = false;
  private whisperTimer: ReturnType<typeof setTimeout> | undefined;
  private cancelLoad: (() => void) | null = null;
  private assembler = new VoiceCommandAssembler();
  private resetRecognition: (() => void) | null = null;
  private clearAudio: (() => void) | null = null;
  private statusSink: ((text: string) => void) | null = null;
  private inputEpoch = 0;
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
  resetCommand = (reason = 'Pending command cancelled.') => {
    const hadPending = !!this.assembler.pending;
    ++this.inputEpoch;
    this.clearAudio?.();
    this.resetRecognition?.();
    this.assembler.reset();
    this.update({ pending: '', expected: [], partial: '' });
    if (hadPending) {
      this.log('', reason);
      this.statusSink?.(`${reason} Say “apex” to start again.`);
    }
  };
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
    getOptions: () => Pick<Settings, 'speechRecognizer' | 'voiceConfidence' | 'requireWakeWord'>,
  ): Promise<void> {
    await this.stop();
    const generation = ++this.generation;
    const options = getOptions();
    this.recognizerName = RECOGNIZERS[options.speechRecognizer].label;
    const status = (text: string) => {
      if (generation !== this.generation) return;
      this.update({ status: text });
      if (/stopped|disconnected|suspended/i.test(text)) this.log('', text);
      onStatus(text);
    };
    this.statusSink = status;
    const received = async (text: string, words?: VoiceEvent['words'], elapsed?: number) => {
      if (generation !== this.generation) return;
      this.update({ partial: '' });
      if (!text.trim()) {
        if (elapsed !== undefined)
          this.log('', 'Speech was detected, but Whisper returned no words.');
        return;
      }
      const decision = this.assembler.accept(text, words, getOptions());
      this.update({ pending: decision.pending, expected: decision.expected });
      if (decision.kind !== 'command') {
        this.log(text, decision.detail, words);
        status(decision.detail);
        return;
      }
      const result = await onText(decision.commandText!);
      if (generation !== this.generation) return;
      this.log(
        text,
        `${result} Assembled: “${decision.commandText}”. ${decision.detail}` +
          (elapsed !== undefined ? ` Transcription: ${(elapsed / 1000).toFixed(1)} s.` : ''),
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
              if (data.epoch === this.inputEpoch) void received(data.text, undefined, data.elapsed);
              else
                status(
                  'Listening for “apex”. Discarded transcription from the previous command context.',
                );
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
        const createRecognizer = () => {
          this.recognizer?.remove();
          const recognizer =
            options.speechRecognizer === 'vosk-open'
              ? new model.KaldiRecognizer(context.sampleRate)
              : new model.KaldiRecognizer(context.sampleRate, JSON.stringify(speechVocabulary()));
          this.recognizer = recognizer;
          recognizer.setWords(true);
          recognizer.on('result', (message) => {
            if (
              generation !== this.generation ||
              this.recognizer !== recognizer ||
              message.event !== 'result'
            )
              return;
            const text = message.result.text.trim();
            const words = message.result.result ?? [];
            void received(text, words);
          });
          recognizer.on('partialresult', (message) => {
            if (
              generation === this.generation &&
              this.recognizer === recognizer &&
              message.event === 'partialresult' &&
              message.result.partial !== this.snapshot.partial
            )
              this.update({ partial: message.result.partial });
          });
          recognizer.on('error', () => {
            if (this.recognizer !== recognizer) return;
            status('Voice input stopped. Try enabling the microphone again.');
            void this.stop();
          });
        };
        this.resetRecognition = createRecognizer;
        createRecognizer();
      }
      if (generation !== this.generation || !this.stream) return;
      await context.audioWorklet.addModule('/audio-capture.js');
      if (generation !== this.generation || !this.stream) return;
      this.capture = new AudioWorkletNode(context, 'apex-capture');
      let buffer = new Float32Array(4096),
        offset = 0;
      const utterance = new UtteranceBuffer(context.sampleRate);
      this.clearAudio = () => {
        buffer = new Float32Array(4096);
        offset = 0;
        utterance.reset();
      };
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
              : this.assembler.pending
                ? `Continue “${this.assembler.pending}”. Waiting for ${this.assembler.expected.join(' or ')}.`
                : 'Listening for “apex”. Pauses inside commands are welcome.',
          );
          if (speaking) {
            this.log('', 'Input suppressed during spoken announcement (echo protection).');
            utterance.reset();
            if (this.assembler.pending || this.snapshot.partial)
              this.resetCommand('Pending command cleared for a spoken announcement.');
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
            this.whisper.postMessage(
              { type: 'audio', samples: audio, rate: context.sampleRate, epoch: this.inputEpoch },
              [audio.buffer],
            );
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
      status('Listening for “apex”. Pauses inside commands are welcome.');
    } catch (error) {
      this.log('', error instanceof Error ? error.message : 'Voice startup failed.');
      await this.stop();
      throw error;
    }
  }
  async stop() {
    ++this.generation;
    ++this.inputEpoch;
    this.resetRecognition = null;
    this.clearAudio = null;
    this.statusSink = null;
    const cancelLoad = this.cancelLoad;
    this.cancelLoad = null;
    cancelLoad?.();
    clearTimeout(this.whisperTimer);
    this.whisper?.terminate();
    this.whisper = null;
    this.whisperBusy = false;
    this.assembler.reset();
    this.update({ level: 0, partial: '', pending: '', expected: [], status: 'Microphone paused.' });
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
