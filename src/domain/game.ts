import { Chess, type PieceSymbol, type Square } from 'chess.js';
import {
  colorName,
  PIECE_NAMES,
  type Command,
  type GameConfig,
  type GameRecord,
  type RecordedMove,
} from './types';

export class MoveError extends Error {}
export function newRecord(config: GameConfig): GameRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    config,
    moves: [],
    result: null,
    resultText: null,
    ownerId: null,
    revision: 0,
  };
}

/** Pure chess domain. No browser, microphone, storage, or UI dependencies. */
export class GameSession {
  readonly chess = new Chess();
  readonly record: GameRecord;
  constructor(record: GameRecord) {
    this.record = structuredClone(record);
    // Rebuild from moves, rather than trusting a saved FEN: repetition needs history.
    for (const move of record.moves)
      this.chess.move({ from: move.from, to: move.to, promotion: move.promotion });
  }
  play(command: Extract<Command, { type: 'move' }>): RecordedMove {
    if (this.record.result)
      throw new MoveError('This game has ended. Start a new game to keep playing.');
    const piece = this.chess.get(command.from);
    if (!piece) throw new MoveError(`There is no piece on ${command.from}.`);
    if (piece.type !== command.piece)
      throw new MoveError(
        `The piece on ${command.from} is a ${PIECE_NAMES[piece.type]}, not a ${PIECE_NAMES[command.piece]}.`,
      );
    if (piece.color !== this.chess.turn())
      throw new MoveError(`It is ${colorName(this.chess.turn())}’s turn.`);
    const promotion =
      piece.type === 'p' && /[18]$/.test(command.to) ? (command.promotion ?? 'q') : undefined;
    if (command.promotion && !promotion)
      throw new MoveError('Only a pawn reaching the last rank can promote.');
    const legal = this.chess
      .moves({ verbose: true, square: command.from })
      .find((m) => m.to === command.to && m.promotion === promotion);
    if (!legal) {
      if (this.chess.isCheck())
        throw new MoveError('Your king is in check. Choose a move that gets out of check.');
      if (wouldExposeKing(this.chess, command.from, command.to))
        throw new MoveError('This move would place your king in check.');
      throw new MoveError('Invalid move. That piece cannot move to that square.');
    }
    const move = this.chess.move({ from: command.from, to: command.to, promotion });
    const saved: RecordedMove = {
      from: move.from,
      to: move.to,
      piece: move.piece,
      color: move.color,
      san: move.san,
      before: move.before,
      after: move.after,
      ...(move.promotion ? { promotion: move.promotion } : {}),
    };
    this.record.moves.push(saved);
    this.record.updatedAt = new Date().toISOString();
    this.record.revision += 1;
    const ending = gameEnding(this.chess);
    if (ending) Object.assign(this.record, ending);
    return saved;
  }
  positionAt(ply: number): Chess {
    if (ply < 0 || ply > this.record.moves.length)
      throw new Error('Review position is out of range.');
    const replay = new Chess();
    for (const move of this.record.moves.slice(0, ply))
      replay.move({ from: move.from, to: move.to, promotion: move.promotion });
    return replay;
  }
  pgn(): string {
    const copy = this.positionAt(this.record.moves.length);
    const config = this.record.config;
    const engineName = `Stockfish level ${config.level}`;
    copy.header(
      'Event',
      'Apex blindfold practice',
      'Site',
      'Local',
      'Date',
      this.record.createdAt.slice(0, 10).replaceAll('-', '.'),
      'White',
      config.mode === 'engine' && config.playerColor === 'b' ? engineName : 'Player',
      'Black',
      config.mode === 'engine' && config.playerColor === 'w' ? engineName : 'Player',
      'Result',
      this.record.result ?? '*',
    );
    return copy.pgn({ maxWidth: 80 });
  }
}

export function gameEnding(chess: Chess): { result: string; resultText: string } | null {
  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? 'Black' : 'White';
    return {
      result: winner === 'White' ? '1-0' : '0-1',
      resultText: `${winner} wins by checkmate.`,
    };
  }
  if (chess.isStalemate()) return { result: '1/2-1/2', resultText: 'Draw by stalemate.' };
  // Casual practice policy: claimable draws are automatically adjudicated.
  if (chess.isThreefoldRepetition())
    return { result: '1/2-1/2', resultText: 'Draw by threefold repetition.' };
  if (chess.isInsufficientMaterial())
    return { result: '1/2-1/2', resultText: 'Draw by insufficient material.' };
  if (chess.isDrawByFiftyMoves())
    return { result: '1/2-1/2', resultText: 'Draw by the fifty-move rule.' };
  return null;
}

// This is only an explanation helper. chess.js remains the authority on legality.
function wouldExposeKing(chess: Chess, from: Square, to: Square): boolean {
  const piece = chess.get(from);
  if (!piece || from === to || chess.get(to)?.color === piece.color) return false;
  const dx = to.charCodeAt(0) - from.charCodeAt(0),
    dy = Number(to[1]) - Number(from[1]);
  const ax = Math.abs(dx),
    ay = Math.abs(dy);
  const direction = piece.color === 'w' ? 1 : -1;
  const ep = chess.fen().split(' ')[3];
  const shapes: Record<PieceSymbol, boolean> = {
    n: ax * ay === 2,
    k: Math.max(ax, ay) === 1,
    b: ax === ay,
    r: dx === 0 || dy === 0,
    q: ax === ay || dx === 0 || dy === 0,
    p:
      (dx === 0 &&
        !chess.get(to) &&
        (dy === direction ||
          (dy === 2 * direction && from[1] === (piece.color === 'w' ? '2' : '7')))) ||
      (ax === 1 && dy === direction && (!!chess.get(to) || to === ep)),
  };
  if (!shapes[piece.type]) return false;
  if (piece.type !== 'n') {
    for (let step = 1; step < Math.max(ax, ay); step++) {
      const square =
        `${String.fromCharCode(from.charCodeAt(0) + Math.sign(dx) * step)}${Number(from[1]) + Math.sign(dy) * step}` as Square;
      if (chess.get(square)) return false;
    }
  }
  const simulated = new Chess(chess.fen());
  simulated.remove(from);
  simulated.remove(to);
  if (piece.type === 'p' && to === ep && dx) simulated.remove(`${to[0]}${from[1]}` as Square);
  simulated.put(piece, to);
  const king = simulated
    .board()
    .flat()
    .find((p) => p?.type === 'k' && p.color === piece.color);
  return !!king && simulated.isAttacked(king.square, piece.color === 'w' ? 'b' : 'w');
}

export function reviewPly(move: number, total: number): number {
  const ply = (move - 1) * 2 + 1;
  if (!Number.isInteger(move) || move < 1 || ply > total)
    throw new Error(`Move ${move} has not been played yet.`);
  return ply;
}
export function advanceReview(current: number, count: number, total: number): number {
  if (!Number.isInteger(count) || count < 1) throw new Error('Choose a positive number of moves.');
  if (current + count > total) throw new Error('There are no more moves that far ahead.');
  return current + count;
}
