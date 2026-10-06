import { describe, it, expect } from 'vitest';
import { pronunciationText, pronunciationSegments, UtteranceBuffer } from './voice-utils';

describe('speech pronunciation', () => {
  it('speaks file letters and ranks without changing ordinary articles or numbers', () => {
    expect(pronunciationText('White played bishop a3 to a 6. A game with a friend. Move 13.')).toBe(
      'White played bishop ay, three to ay, six. A game with a friend. Move 13.',
    );
    expect(pronunciationText('b2 C3 d4 E5 f6 g7 H8')).toBe(
      'bee, two see, three dee, four ee, five eff, six jee, seven aitch, eight',
    );
  });
  it('splits precisely between file and rank for an explicit synthesis delay', () => {
    expect(pronunciationSegments('Pawn a4.')).toEqual(['Pawn ay', 'four.']);
    expect(pronunciationSegments('a 4 is empty.')).toEqual(['ay', 'four is empty.']);
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
