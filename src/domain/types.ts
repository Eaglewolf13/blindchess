import type { Color, PieceSymbol, Square } from 'chess.js';

export type GameMode = 'self' | 'engine';
export type Promotion = 'q' | 'r' | 'b' | 'n';
export interface GameConfig {
  mode: GameMode;
  level: number;
  playerColor: Color;
}
export interface RecordedMove {
  from: Square;
  to: Square;
  piece: PieceSymbol;
  color: Color;
  san: string;
  before: string;
  after: string;
  promotion?: PieceSymbol;
}
export interface GameRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  config: GameConfig;
  moves: RecordedMove[];
  result: string | null;
  resultText: string | null;
  // Owner and revision are reserved for the online repository adapter.
  ownerId: string | null;
  revision: number;
}
export type CommandId =
  | 'move'
  | 'vision'
  | 'review'
  | 'next'
  | 'eval'
  | 'newGame'
  | 'returnToPlay'
  | 'lastMove';
export type Command =
  | { type: 'move'; piece: PieceSymbol; from: Square; to: Square; promotion?: Promotion }
  | { type: 'vision'; square: Square }
  | { type: 'review'; move: number }
  | { type: 'next'; count: number }
  | { type: 'eval' }
  | { type: 'returnToPlay' }
  | { type: 'lastMove' }
  | { type: 'newGame'; mode: GameMode; level: number };
export interface SpeechPreferences {
  speechPronunciation: 'letters' | 'letters-spaced';
  speechBeforeSquareMs: number;
  speechGapMs: number;
  speechVoice: string;
}
export interface Settings extends SpeechPreferences {
  sound: boolean;
  requireWakeWord: boolean;
  showBoard: boolean;
  speechRecognizer: 'vosk' | 'vosk-open' | 'whisper';
  voiceDebug: boolean;
  voiceConfidence: number;
  enabledCommands: Record<CommandId, boolean>;
}
export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  requireWakeWord: true,
  showBoard: false,
  speechRecognizer: 'vosk',
  voiceDebug: false,
  voiceConfidence: 0.5,
  speechPronunciation: 'letters',
  speechBeforeSquareMs: 100,
  speechGapMs: 0,
  speechVoice: '',
  enabledCommands: {
    move: true,
    vision: true,
    review: true,
    next: true,
    eval: true,
    newGame: true,
    returnToPlay: true,
    lastMove: true,
  },
};
export const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};
export const colorName = (color: Color) => (color === 'w' ? 'White' : 'Black');
export const spokenSquare = (square: string) => `${square[0]} ${square[1]}`;
export function describeMove(move: RecordedMove): string {
  return (
    `${PIECE_NAMES[move.piece]} ${spokenSquare(move.from)} to ${spokenSquare(move.to)}` +
    (move.promotion ? `, promotes to ${PIECE_NAMES[move.promotion]}` : '')
  );
}
