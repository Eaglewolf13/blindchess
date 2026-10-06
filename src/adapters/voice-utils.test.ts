import { describe, it, expect } from 'vitest';
import { pronunciationText, rejectionReason, UtteranceBuffer } from './voice-utils';

describe('speech pronunciation', () => {
  it('speaks file letters and ranks without changing ordinary articles or numbers', () => {
    expect(pronunciationText('White played bishop a3 to a 6. A game with a friend. Move 13.')).toBe(
      'White played bishop ay three to ay six. A game with a friend. Move 13.',
    );
    expect(pronunciationText('b2 C3 d4 E5 f6 g7 H8')).toBe(
      'bee two see three dee four ee five eff six jee seven aitch eight',
    );
  });
});
describe('recognition filtering', () => {
  it('explains discarded transcripts and applies the configurable threshold', () => {
    expect(rejectionReason('apex move pawn', [{ conf: 0.4 }], 0.5)).toContain('below 50%');
    expect(rejectionReason('apex move pawn', [{ conf: 0.4 }], 0.35)).toBeNull();
    expect(rejectionReason('apex [unk]', [], 0)).toContain('Unknown');
    expect(rejectionReason('', [], 0)).toContain('No words');
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
