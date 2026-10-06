import { describe, it, expect } from 'vitest';
import { pronunciationSegments, UtteranceBuffer } from './voice-utils';

describe('speech pronunciation', () => {
  it('speaks file letters and ranks without changing ordinary articles or numbers', () => {
    expect(
      pronunciationSegments('White played bishop a3 to a 6. A game with a friend. Move 13.'),
    ).toEqual(['White played bishop A, three to A, six. A game with a friend. Move 13.']);
    expect(pronunciationSegments('b2 C3 d4 E5 f6 g7 H8')).toEqual([
      'B, two C, three D, four E, five F, six G, seven H, eight',
    ]);
    expect(pronunciationSegments('Black played bishop e 3 to f 2. King f8 to d8.')).toEqual([
      'Black played bishop E, three to F, two. King F, eight to D, eight.',
    ]);
  });
  it('splits precisely between file and rank for an explicit synthesis delay', () => {
    expect(pronunciationSegments('Pawn a4.', 'letters-spaced')).toEqual(['Pawn A', 'four.']);
    expect(pronunciationSegments('a 4 is empty.', 'letters-spaced')).toEqual([
      'A',
      'four is empty.',
    ]);
    expect(pronunciationSegments('Black played bishop e3 to f2.', 'phonetic')).toEqual([
      'Black played bishop ee',
      'three to eff',
      'two.',
    ]);
    expect(pronunciationSegments('a4', 'phonetic')).toEqual(['ay', 'four']);
    expect(pronunciationSegments('White to move.')).toEqual(['White to move.']);
    expect(pronunciationSegments('')).toEqual([]);
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
