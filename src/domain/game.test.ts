import { Chess, type Square } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { GameSession, advanceReview, gameEnding, newRecord, reviewPly } from './game';
import type { GameRecord } from './types';

function sessionAfter(sans: string[]) {
  const record = newRecord({ mode: 'self', level: 3, playerColor: 'w' });
  const chess = new Chess();
  for (const san of sans) {
    const m = chess.move(san);
    record.moves.push({
      from: m.from,
      to: m.to,
      piece: m.piece,
      color: m.color,
      san: m.san,
      before: m.before,
      after: m.after,
      promotion: m.promotion,
    });
  }
  return new GameSession(record);
}
function move(session: GameSession, from: string, to: string) {
  return session.play({
    type: 'move',
    piece: session.chess.get(from as Square)!.type,
    from: from as Square,
    to: to as Square,
  });
}
describe('chess domain', () => {
  it('validates pieces and turns without changing the board on errors', () => {
    const session = sessionAfter([]);
    expect(() => session.play({ type: 'move', piece: 'q', from: 'e2', to: 'e4' })).toThrow('pawn');
    expect(() => move(session, 'e7', 'e5')).toThrow('White');
    expect(session.record.moves).toHaveLength(0);
    move(session, 'e2', 'e4');
    expect(session.chess.turn()).toBe('b');
  });
  it('announces checkmate and exports a portable PGN result', () => {
    const session = sessionAfter(['f3', 'e5', 'g4']);
    move(session, 'd8', 'h4');
    expect(session.record.resultText).toBe('Black wins by checkmate.');
    const imported = new Chess();
    imported.loadPgn(session.pgn());
    expect(imported.isCheckmate()).toBe(true);
    expect(imported.getHeaders().Result).toBe('0-1');
  });
  it('moves the rook when castling through a king command', () => {
    const session = sessionAfter(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6']);
    move(session, 'e1', 'g1');
    expect(session.chess.get('f1')?.type).toBe('r');
    expect(session.chess.get('h1')).toBeUndefined();
  });
  it('handles en passant', () => {
    const session = sessionAfter(['e4', 'a6', 'e5', 'd5']);
    move(session, 'e5', 'd6');
    expect(session.chess.get('d5')).toBeUndefined();
    expect(session.chess.get('d6')?.color).toBe('w');
  });
  it('identifies moves that expose the king', () => {
    const session = sessionAfter(['d4', 'd5', 'Nc3', 'Nf6', 'Bf4', 'e6', 'e3', 'Bb4']);
    expect(() => move(session, 'c3', 'b5')).toThrow('king in check');
  });
  it('retains repetition history after restoring a saved game', () => {
    const session = sessionAfter(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1']);
    const restored = new GameSession(JSON.parse(JSON.stringify(session.record)) as GameRecord);
    move(restored, 'f6', 'g8');
    expect(restored.record.resultText).toBe('Draw by threefold repetition.');
  });
  it('distinguishes stalemate, insufficient material and the fifty-move rule', () => {
    expect(gameEnding(new Chess('7k/5K2/6Q1/8/8/8/8/8 b - - 0 1'))?.resultText).toContain(
      'stalemate',
    );
    expect(gameEnding(new Chess('7k/8/6K1/8/8/8/8/8 b - - 0 1'))?.resultText).toContain(
      'insufficient material',
    );
    expect(gameEnding(new Chess('7k/8/6K1/8/8/8/8/R7 w - - 100 70'))?.resultText).toContain(
      'fifty-move',
    );
  });
  it('reviews a historical position without changing live play', () => {
    const session = sessionAfter(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(reviewPly(2, 4)).toBe(3);
    expect(advanceReview(1, 3, 4)).toBe(4);
    expect(() => advanceReview(3, 2, 4)).toThrow();
    expect(session.positionAt(1).get('e7')?.type).toBe('p');
    expect(session.chess.get('e5')?.type).toBe('p');
  });
  it('supports explicit underpromotion and defaults to queen', () => {
    const sequence = ['a4', 'h5', 'a5', 'h4', 'a6', 'h3', 'axb7', 'hxg2'];
    const session = sessionAfter(sequence);
    session.play({ type: 'move', piece: 'p', from: 'b7', to: 'a8', promotion: 'n' });
    expect(session.chess.get('a8')?.type).toBe('n');
    const other = sessionAfter(sequence);
    move(other, 'b7', 'a8');
    expect(other.chess.get('a8')?.type).toBe('q');
  });
});
