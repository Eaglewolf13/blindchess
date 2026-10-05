import { describe, expect, it } from 'vitest';
import { evaluationText } from './engine';

describe('evaluation perspective', () => {
  it('reports scores from White’s perspective regardless of whose turn it is', () => {
    expect(evaluationText({ bestMove: null, centipawns: 200, depth: 10 }, 'w')).toBe(
      'White is winning, +2.0.',
    );
    expect(evaluationText({ bestMove: null, centipawns: 200, depth: 10 }, 'b')).toBe(
      'Black is winning, −2.0.',
    );
  });
  it('announces mating scores and balanced positions', () => {
    expect(evaluationText({ bestMove: null, mate: -3, depth: 10 }, 'b')).toBe(
      'White has mate in 3.',
    );
    expect(evaluationText({ bestMove: null, centipawns: 5, depth: 10 }, 'w')).toContain('equal');
  });
});
