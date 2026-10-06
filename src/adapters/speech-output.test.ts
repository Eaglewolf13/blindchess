import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserSpeechOutput } from './speech';

describe('spoken coordinate timing', () => {
  const spoken: { text: string; onend?: () => void; onerror?: () => void }[] = [];
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
  it('inserts a real 160 ms gap and keeps echo suppression active throughout', () => {
    const output = new BrowserSpeechOutput();
    output.say('Pawn a4.');
    expect(spoken.map((utterance) => utterance.text)).toEqual(['Pawn ay']);
    spoken[0].onend!();
    vi.advanceTimersByTime(159);
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
});
