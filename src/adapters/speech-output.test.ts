import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserSpeechOutput } from './speech';
import { DEFAULT_SETTINGS } from '../domain/types';

describe('spoken coordinate timing', () => {
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
      'Black played bishop E, three to F, two. King F, eight to D, eight. Pawn A, four.',
    ]);
    spoken[0].onend!();
    vi.advanceTimersByTime(1000);
    expect(spoken).toHaveLength(1);
    expect(output.speaking).toBe(false);
  });
  it('uses the selected extra gap and keeps echo suppression active throughout', () => {
    const output = new BrowserSpeechOutput();
    output.configure({
      ...DEFAULT_SETTINGS,
      speechPronunciation: 'letters-spaced',
      speechGapMs: 40,
    });
    output.say('Pawn a4.');
    expect(spoken.map((utterance) => utterance.text)).toEqual(['Pawn A']);
    spoken[0].onend!();
    vi.advanceTimersByTime(39);
    expect(spoken).toHaveLength(1);
    expect(output.speaking).toBe(true);
    vi.advanceTimersByTime(1);
    expect(spoken[1].text).toBe('four.');
    spoken[1].onend!();
    vi.advanceTimersByTime(351);
    expect(output.speaking).toBe(false);
  });
  it('cancels queued syllables when muted or replaced and ignores old callbacks', () => {
    const output = new BrowserSpeechOutput();
    output.configure({ ...DEFAULT_SETTINGS, speechPronunciation: 'phonetic', speechGapMs: 160 });
    output.say('a3');
    spoken[0].onend!();
    output.setEnabled(false);
    vi.advanceTimersByTime(1000);
    expect(spoken).toHaveLength(1);
    output.setEnabled(true);
    output.say('b4');
    const old = spoken[1];
    output.say('White to move.');
    old.onend!();
    old.onerror!();
    vi.advanceTimersByTime(1000);
    expect(spoken.map((utterance) => utterance.text)).toEqual(['ay', 'bee', 'White to move.']);
  });
  it('does not duplicate a rank when the same native end callback fires twice', () => {
    const output = new BrowserSpeechOutput();
    output.configure({
      ...DEFAULT_SETTINGS,
      speechPronunciation: 'letters-spaced',
      speechGapMs: 0,
    });
    output.say('Bishop e3 to f2.');
    const first = spoken[0];
    first.onend!();
    first.onend!();
    vi.advanceTimersByTime(0);
    expect(spoken.map(({ text }) => text)).toEqual(['Bishop E', 'three to F']);
    first.onend!();
    first.onerror!();
    spoken[1].onend!();
    vi.advanceTimersByTime(0);
    expect(spoken.map(({ text }) => text)).toEqual(['Bishop E', 'three to F', 'two.']);
  });
  it('cancels old chunks when pronunciation settings change', () => {
    const output = new BrowserSpeechOutput();
    output.configure({ ...DEFAULT_SETTINGS, speechPronunciation: 'phonetic' });
    output.say('a3');
    spoken[0].onend!();
    output.configure(DEFAULT_SETTINGS);
    vi.advanceTimersByTime(1000);
    expect(spoken).toHaveLength(1);
    output.say('a3');
    expect(spoken[1].text).toBe('A, three');
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
