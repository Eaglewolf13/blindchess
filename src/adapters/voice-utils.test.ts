import { describe, it, expect } from 'vitest';
import { pronunciationSegments, UtteranceBuffer } from './voice-utils';
import { DEFAULT_SETTINGS } from '../domain/types';

describe('speech pronunciation', () => {
  it('speaks file letters and ranks without changing ordinary articles or numbers', () => {
    expect(
      pronunciationSegments('White played bishop a3 to a 6. A game with a friend. Move 13.'),
    ).toEqual([
      {
        text: 'White played bishop A three to A six. A game with a friend. Move 13.',
        pauseBeforeMs: 0,
      },
    ]);
    expect(pronunciationSegments('b2 C3 d4 E5 f6 g7 H8')).toEqual([
      { text: 'B two C three D four E five F six G seven H eight', pauseBeforeMs: 0 },
    ]);
    expect(pronunciationSegments('Black played bishop e 3 to f 2. King f8 to d8.')).toEqual([
      { text: 'Black played bishop E three to F two. King F eight to D eight.', pauseBeforeMs: 0 },
    ]);
  });
  it('assigns independent gaps before every file and rank, with no inserted punctuation', () => {
    expect(
      pronunciationSegments('Pawn a2 to a4.', {
        ...DEFAULT_SETTINGS,
        speechPronunciation: 'letters-spaced',
        speechBeforeSquareMs: 120,
        speechGapMs: 20,
      }),
    ).toEqual([
      { text: 'Pawn', pauseBeforeMs: 0 },
      { text: 'A', pauseBeforeMs: 120 },
      { text: 'two to', pauseBeforeMs: 20 },
      { text: 'A', pauseBeforeMs: 120 },
      { text: 'four.', pauseBeforeMs: 20 },
    ]);
  });
  it('merges zero-gap boundaries so the synthesizer does not add a chunk pause there', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      speechPronunciation: 'letters-spaced' as const,
      speechBeforeSquareMs: 100,
    };
    expect(pronunciationSegments('Pawn a2 to a4.', settings)).toEqual([
      { text: 'Pawn', pauseBeforeMs: 0 },
      { text: 'A two to', pauseBeforeMs: 100 },
      { text: 'A four.', pauseBeforeMs: 100 },
    ]);
    expect(
      pronunciationSegments('Pawn a2 to a4.', {
        ...settings,
        speechBeforeSquareMs: 0,
        speechGapMs: 20,
      }),
    ).toEqual([
      { text: 'Pawn A', pauseBeforeMs: 0 },
      { text: 'two to A', pauseBeforeMs: 20 },
      { text: 'four.', pauseBeforeMs: 20 },
    ]);
    expect(
      pronunciationSegments('Pawn a2 to a4.', { ...settings, speechBeforeSquareMs: 0 }),
    ).toEqual([{ text: 'Pawn A two to A four.', pauseBeforeMs: 0 }]);
  });
  it('does not add an initial pause and preserves ordinary narration and punctuation', () => {
    const settings = { ...DEFAULT_SETTINGS, speechPronunciation: 'letters-spaced' as const };
    expect(pronunciationSegments('a4, check.', settings)).toEqual([
      { text: 'A four, check.', pauseBeforeMs: 0 },
    ]);
    expect(pronunciationSegments('White to move.', settings)).toEqual([
      { text: 'White to move.', pauseBeforeMs: 0 },
    ]);
    expect(pronunciationSegments('')).toEqual([]);
    expect(pronunciationSegments(' ', settings)).toEqual([]);
  });
});
describe('Whisper endpointing', () => {
  it('ignores silence and clicks, ends a sentence after a pause, and resets', () => {
    const buffer = new UtteranceBuffer(16000);
    const chunk = new Float32Array(1600);
    for (let i = 0; i < 20; i++) expect(buffer.push(chunk, 0)).toBeNull();
    buffer.push(chunk, 0.1); // A brief click, not speech.
    for (let i = 0; i < 10; i++) expect(buffer.push(chunk, 0)).toBeNull();
    for (let i = 0; i < 5; i++) expect(buffer.push(chunk, 0.1)).toBeNull();
    for (let i = 0; i < 8; i++) expect(buffer.push(chunk, 0)).toBeNull();
    expect(buffer.push(chunk, 0)?.length).toBeGreaterThan(16000);
    expect(buffer.push(chunk, 0)).toBeNull();
  });
  it('bounds a continuously noisy recording to twelve seconds', () => {
    const buffer = new UtteranceBuffer(16000);
    for (let i = 0; i < 119; i++) expect(buffer.push(new Float32Array(1600), 0.2)).toBeNull();
    expect(buffer.push(new Float32Array(1600), 0.2)?.length).toBe(192000);
  });
});
