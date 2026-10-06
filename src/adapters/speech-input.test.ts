import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalSpeechInput, BrowserSpeechOutput } from './speech';

const fakes = vi.hoisted(() => ({
  recognizers: [] as {
    emit: (event: string, result: object) => void;
    remove: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock('./offline', () => ({
  speechModelUrl: async () => '/local-model',
  RECOGNIZERS: { vosk: { label: 'Vosk' } },
}));
vi.mock('vosk-browser', () => {
  class Recognizer {
    private handlers = new Map<string, (message: object) => void>();
    remove = vi.fn();
    setWords() {}
    acceptWaveformFloat() {}
    constructor() {
      fakes.recognizers.push(this);
    }
    on(event: string, handler: (message: object) => void) {
      this.handlers.set(event, handler);
    }
    emit(event: string, result: object) {
      this.handlers.get(event)?.({ event, result });
    }
  }
  return {
    Model: class {
      ready = true;
      KaldiRecognizer = Recognizer;
      terminate() {}
      on(event: string, handler: (message: object) => void) {
        if (event === 'load') queueMicrotask(() => handler({ result: true }));
      }
    },
  };
});

describe('speech capture integration with finalized recognition events', () => {
  let input: LocalSpeechInput;
  const stopTrack = vi.fn();
  beforeEach(() => {
    fakes.recognizers.length = 0;
    stopTrack.mockClear();
    vi.stubGlobal('window', {});
    vi.stubGlobal('Worker', class {});
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop: stopTrack }],
          getAudioTracks: () => [],
        }),
      },
    });
    vi.stubGlobal(
      'AudioWorkletNode',
      class {
        port = { onmessage: null };
        connect() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      'AudioContext',
      class {
        sampleRate = 16000;
        state = 'running';
        audioWorklet = { addModule: async () => {} };
        async resume() {}
        async close() {
          this.state = 'closed';
        }
        createMediaStreamSource() {
          return { connect() {}, disconnect() {} };
        }
      },
    );
    input = new LocalSpeechInput(new BrowserSpeechOutput());
  });
  afterEach(async () => {
    await input.stop();
    vi.unstubAllGlobals();
  });
  it('never executes a changing partial; finals continue across pauses', async () => {
    const onText = vi.fn(async () => 'Handled: move.');
    await input.start(onText, vi.fn(), () => ({
      speechRecognizer: 'vosk',
      voiceConfidence: 0.5,
      requireWakeWord: true,
    }));
    const recognizer = fakes.recognizers[0];
    recognizer.emit('partialresult', { partial: 'apex move pawn e two e four' });
    expect(onText).not.toHaveBeenCalled();
    recognizer.emit('result', { text: 'one two apex move pawn e two' });
    expect(input.getSnapshot().pending).toBe('apex move pawn e two');
    expect(onText).not.toHaveBeenCalled();
    recognizer.emit('result', { text: '[unk] e three' });
    expect(onText).toHaveBeenCalledExactlyOnceWith('apex move pawn e two e three');
  });
  it('ignores buffered old results after cancellation, and releases capture on stop', async () => {
    const onText = vi.fn(async () => 'Handled.');
    await input.start(onText, vi.fn(), () => ({
      speechRecognizer: 'vosk',
      voiceConfidence: 0.5,
      requireWakeWord: true,
    }));
    const old = fakes.recognizers[0];
    old.emit('result', { text: 'apex move pawn e two' });
    input.resetCommand();
    old.emit('result', { text: 'apex move pawn e two e four' });
    expect(onText).not.toHaveBeenCalled();
    expect(old.remove).toHaveBeenCalledOnce();
    fakes.recognizers[1].emit('result', { text: 'e four' });
    expect(onText).not.toHaveBeenCalled();
    fakes.recognizers[1].emit('result', { text: 'apex vision e four' });
    expect(onText).toHaveBeenCalledExactlyOnceWith('apex vision e four');
    await input.stop();
    expect(stopTrack).toHaveBeenCalledOnce();
  });
  it('reads changes to confidence on the active microphone without consulting debug', async () => {
    let confidence = 0.5;
    const onText = vi.fn(async () => 'Handled.');
    await input.start(onText, vi.fn(), () => ({
      speechRecognizer: 'vosk',
      voiceConfidence: confidence,
      requireWakeWord: true,
    }));
    const result = {
      text: 'apex move pawn e two e four',
      result: [
        { word: 'apex move', conf: 1 },
        { word: 'pawn', conf: 0.4 },
        { word: 'e two e four', conf: 1 },
      ],
    };
    fakes.recognizers[0].emit('result', result);
    expect(onText).not.toHaveBeenCalled();
    confidence = 0.35;
    fakes.recognizers[0].emit('result', result);
    expect(onText).toHaveBeenCalledExactlyOnceWith('apex move pawn e two e four');
  });
});
