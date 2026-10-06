import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserSpeechOutput } from './speech';
import { DEFAULT_SETTINGS } from '../domain/types';
import { AppController } from '../application/controller';
import type { ChessEngine, GameRepository } from '../ports';

describe('speech queue and coordinate timing', () => {
  const spoken: {
    text: string;
    voice?: SpeechSynthesisVoice;
    lang?: string;
    onend?: () => void;
    onerror?: () => void;
  }[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    spoken.length = 0;
    const synthesis = {
      speaking: false,
      cancel: vi.fn(),
      getVoices: () => [],
      speak: (utterance: (typeof spoken)[number]) => spoken.push(utterance),
    };
    vi.stubGlobal('window', { speechSynthesis: synthesis });
    vi.stubGlobal('speechSynthesis', synthesis);
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        constructor(public text: string) {}
      },
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it('speaks the reported examples in one sentence, without phonetic spellings or scheduled chunks', () => {
    const output = new BrowserSpeechOutput();
    output.say('Black played bishop e3 to f2. King f8 to d8. Pawn a4.');
    expect(spoken.map(({ text }) => text)).toEqual([
      'Black played bishop E three to F two. King F eight to D eight. Pawn A four.',
    ]);
    spoken[0].onend!();
    vi.advanceTimersByTime(1000);
    expect(spoken).toHaveLength(1);
    expect(output.speaking).toBe(false);
  });
  it('times the two gaps independently and keeps echo suppression active throughout', () => {
    const output = new BrowserSpeechOutput();
    output.configure({
      ...DEFAULT_SETTINGS,
      speechPronunciation: 'letters-spaced',
      speechBeforeSquareMs: 120,
      speechGapMs: 40,
    });
    output.say('Pawn a4.');
    expect(spoken.map((utterance) => utterance.text)).toEqual(['Pawn']);
    spoken[0].onend!();
    vi.advanceTimersByTime(119);
    expect(spoken).toHaveLength(1);
    expect(output.speaking).toBe(true);
    vi.advanceTimersByTime(1);
    expect(spoken[1].text).toBe('A');
    spoken[1].onend!();
    vi.advanceTimersByTime(39);
    expect(spoken).toHaveLength(2);
    expect(output.speaking).toBe(true);
    vi.advanceTimersByTime(1);
    expect(spoken[2].text).toBe('four.');
    spoken[2].onend!();
    vi.advanceTimersByTime(351);
    expect(output.speaking).toBe(false);
  });
  it('clears complete announcements and remaining syllables on mute or stop', () => {
    const output = new BrowserSpeechOutput();
    output.configure({
      ...DEFAULT_SETTINGS,
      speechPronunciation: 'letters-spaced',
      speechGapMs: 160,
    });
    output.say('a3');
    output.say('Discard this queued line.');
    spoken[0].onend!();
    output.setEnabled(false);
    output.say('Do not save announcements while muted.');
    vi.advanceTimersByTime(1000);
    expect(spoken).toHaveLength(1);
    output.setEnabled(true);
    output.say('b4');
    const old = spoken[1];
    output.say('Also discard this queued line.');
    output.stop();
    output.say('White to move.');
    old.onend!();
    old.onerror!();
    vi.advanceTimersByTime(1000);
    expect(spoken.map((utterance) => utterance.text)).toEqual(['A', 'B', 'White to move.']);
  });
  it('does not duplicate a rank when the same native end callback fires twice', () => {
    const output = new BrowserSpeechOutput();
    output.configure({
      ...DEFAULT_SETTINGS,
      speechPronunciation: 'letters-spaced',
      speechBeforeSquareMs: 0,
      speechGapMs: 40,
    });
    output.say('Bishop e3 to f2.');
    const first = spoken[0];
    first.onend!();
    first.onend!();
    vi.advanceTimersByTime(40);
    expect(spoken.map(({ text }) => text)).toEqual(['Bishop E', 'three to F']);
    first.onend!();
    first.onerror!();
    spoken[1].onend!();
    vi.advanceTimersByTime(40);
    expect(spoken.map(({ text }) => text)).toEqual(['Bishop E', 'three to F', 'two.']);
  });
  it('cancels old chunks when pronunciation settings change', () => {
    const output = new BrowserSpeechOutput();
    output.configure({
      ...DEFAULT_SETTINGS,
      speechPronunciation: 'letters-spaced',
      speechGapMs: 40,
    });
    output.say('a3');
    output.say('Discard this queued line on a settings change.');
    spoken[0].onend!();
    output.configure(DEFAULT_SETTINGS);
    vi.advanceTimersByTime(1000);
    expect(spoken).toHaveLength(1);
    output.say('a3');
    expect(spoken[1].text).toBe('A three');
  });
  it('keeps a zero-gap square together while delaying the start of each square', () => {
    const output = new BrowserSpeechOutput();
    output.configure({
      ...DEFAULT_SETTINGS,
      speechPronunciation: 'letters-spaced',
      speechBeforeSquareMs: 100,
      speechGapMs: 0,
    });
    output.say('Pawn a2 to a4.');
    expect(spoken[0].text).toBe('Pawn');
    spoken[0].onend!();
    vi.advanceTimersByTime(100);
    expect(spoken[1].text).toBe('A two to');
    spoken[1].onend!();
    vi.advanceTimersByTime(99);
    expect(spoken).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(spoken[2].text).toBe('A four.');
  });
  it('cancels a pending before-letter gap when that setting changes', () => {
    const output = new BrowserSpeechOutput();
    const preferences = {
      ...DEFAULT_SETTINGS,
      speechPronunciation: 'letters-spaced' as const,
      speechBeforeSquareMs: 100,
    };
    output.configure(preferences);
    output.say('Pawn a2');
    spoken[0].onend!();
    output.configure({ ...preferences, speechBeforeSquareMs: 200 });
    vi.advanceTimersByTime(1000);
    expect(spoken).toHaveLength(1);
  });
  it('plays complete announcements in order without cancelling current speech', () => {
    const output = new BrowserSpeechOutput();
    output.say('Move made.');
    output.say('Black pawn e7 to e5.');
    output.say('White to move.');
    expect(spoken.map(({ text }) => text)).toEqual(['Move made.']);
    expect(speechSynthesis.cancel).not.toHaveBeenCalled();
    output.configure(DEFAULT_SETTINGS); // An unrelated settings save must not clear the queue.
    spoken[0].onend!();
    expect(spoken[1].text).toBe('Black pawn E seven to E five.');
    expect(output.speaking).toBe(true);
    spoken[0].onend!(); // A delayed duplicate must not skip the engine announcement.
    expect(spoken).toHaveLength(2);
    spoken[1].onend!();
    expect(spoken[2].text).toBe('White to move.');
    spoken[2].onend!();
    vi.advanceTimersByTime(351);
    expect(output.speaking).toBe(false);
  });
  it('finishes all coordinate segments before speaking a line queued during a gap', () => {
    const output = new BrowserSpeechOutput();
    output.configure({
      ...DEFAULT_SETTINGS,
      speechPronunciation: 'letters-spaced',
      speechGapMs: 40,
    });
    output.say('Pawn a4.');
    spoken[0].onend!();
    output.say('Black to move.');
    vi.advanceTimersByTime(39);
    expect(spoken.map(({ text }) => text)).toEqual(['Pawn A']);
    expect(output.speaking).toBe(true);
    vi.advanceTimersByTime(1);
    expect(spoken[1].text).toBe('four.');
    spoken[1].onend!();
    expect(spoken[2].text).toBe('Black to move.');
  });
  it('clears a failed queue and allows the next announcement to start', () => {
    const output = new BrowserSpeechOutput();
    output.say('First.');
    output.say('Queued.');
    spoken[0].onerror!();
    spoken[0].onend!();
    vi.advanceTimersByTime(1000);
    expect(spoken).toHaveLength(1);
    expect(output.speaking).toBe(false);
    output.say('Retry.');
    expect(spoken[1].text).toBe('Retry.');
  });
  it('does not remain busy if native synthesis throws synchronously', () => {
    const output = new BrowserSpeechOutput();
    const speak = speechSynthesis.speak;
    speechSynthesis.speak = () => {
      throw new Error('Device unavailable');
    };
    expect(() => output.say('First.')).not.toThrow();
    vi.advanceTimersByTime(351);
    expect(output.speaking).toBe(false);
    speechSynthesis.speak = speak;
    output.say('Retry.');
    expect(spoken.map(({ text }) => text)).toEqual(['Retry.']);
  });
  it('lets a fast engine play immediately but waits for the move confirmation before narrating it', async () => {
    const repository: GameRepository = {
      list: async () => [],
      save: async () => {},
      delete: async () => {},
      loadSettings: async () => undefined,
      saveSettings: async () => {},
    };
    const engine: ChessEngine = {
      search: vi.fn(async () => ({ bestMove: 'e7e5', depth: 1 })),
      cancel: vi.fn(),
      dispose: vi.fn(),
    };
    const output = new BrowserSpeechOutput();
    const controller = new AppController(repository, engine, output);
    await controller.initialize();
    await controller.startGame({ mode: 'engine', level: 8, playerColor: 'w' });
    spoken[0].onend!(); // New-game announcement finishes first.
    vi.mocked(speechSynthesis.cancel).mockClear();
    await controller.executeText('move pawn e2 e4');
    await vi.waitFor(() => expect(controller.getSnapshot().game.moves).toHaveLength(2));
    expect(spoken.map(({ text }) => text)).toEqual([
      'New engine game, level 8. You are White.',
      'Move made.',
    ]);
    expect(speechSynthesis.cancel).not.toHaveBeenCalled();
    spoken[1].onend!();
    expect(spoken[2].text).toBe('Black pawn E seven to E five.');
    // Starting another game must discard speech about the old game, including queued lines.
    output.say('Old game reminder.');
    await controller.startGame({ mode: 'self', level: 3, playerColor: 'w' });
    spoken[2].onend!();
    spoken[3].onend!();
    vi.advanceTimersByTime(1000);
    expect(spoken.map(({ text }) => text)).toEqual([
      'New engine game, level 8. You are White.',
      'Move made.',
      'Black pawn E seven to E five.',
      'New self-play game. White to move.',
    ]);
  });
  it('selects a saved installed voice and falls back if it is missing or remote', () => {
    const us = { voiceURI: 'local-us', localService: true, lang: 'en-US' } as SpeechSynthesisVoice;
    const uk = { voiceURI: 'local-uk', localService: true, lang: 'en-GB' } as SpeechSynthesisVoice;
    const remote = {
      voiceURI: 'remote',
      localService: false,
      lang: 'en-US',
    } as SpeechSynthesisVoice;
    speechSynthesis.getVoices = () => [remote, us, uk];
    const output = new BrowserSpeechOutput();
    output.configure({ ...DEFAULT_SETTINGS, speechVoice: uk.voiceURI });
    output.say('e4');
    expect(spoken[0].voice).toBe(uk);
    expect(spoken[0].lang).toBe('en-GB');
    for (const speechVoice of ['missing', 'remote']) {
      output.configure({ ...DEFAULT_SETTINGS, speechVoice });
      output.say('e4');
      expect(spoken.at(-1)?.voice).toBe(us);
    }
  });
});
