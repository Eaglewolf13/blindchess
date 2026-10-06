import type { PieceSymbol, Square } from 'chess.js';
import type { Command, CommandId, Promotion } from './types';
import {
  literal,
  pieceSlot,
  squareSlots,
  promotionSlot,
  numberPatterns,
  levelSlot,
  type VoicePattern,
} from './voice-grammar';

export interface CommandDefinition {
  id: CommandId;
  label: string;
  example: string;
  description: string;
  voice: VoicePattern[];
  match: (text: string) => Command | null;
}
const pieceCodes: Record<string, PieceSymbol> = {
  pawn: 'p',
  knight: 'n',
  bishop: 'b',
  rook: 'r',
  queen: 'q',
  king: 'k',
};
const numberWords: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function number(text: string): number | null {
  if (/^\d{1,3}$/.test(text)) return Number(text);
  const parts = text.split(' ');
  if (parts.some((word) => !(word in numberWords))) return null;
  let hundreds = 0;
  if (parts[1] === 'hundred' && numberWords[parts[0]] >= 1 && numberWords[parts[0]] <= 9) {
    hundreds = numberWords[parts[0]] * 100;
    parts.splice(0, 2);
  }
  if (!parts.length) return hundreds;
  if (parts.length === 1 && parts[0] !== 'hundred') return hundreds + numberWords[parts[0]];
  if (
    parts.length === 2 &&
    numberWords[parts[0]] >= 20 &&
    numberWords[parts[0]] % 10 === 0 &&
    numberWords[parts[1]] >= 1 &&
    numberWords[parts[1]] <= 9
  )
    return hundreds + numberWords[parts[0]] + numberWords[parts[1]];
  return null;
}
function squares(text: string): string {
  // Only normalize file/rank homophones in a square context, never an entire sentence.
  return text
    .replace(/\b([a-h][1-8])([a-h][1-8])\b/g, '$1 $2')
    .replace(
      /\b([a-h]|ay|bee|be|see|sea|dee|ee|eff|gee|aitch)\s*(one|two|three|four|for|five|six|seven|eight|ate|[1-8])\b/g,
      (_, file: string, rank: string) => {
        const files: Record<string, string> = {
          ay: 'a',
          bee: 'b',
          be: 'b',
          see: 'c',
          sea: 'c',
          dee: 'd',
          ee: 'e',
          eff: 'f',
          gee: 'g',
          aitch: 'h',
        };
        return `${files[file] ?? file}${rank === 'for' ? 4 : rank === 'ate' ? 8 : (numberWords[rank] ?? rank)}`;
      },
    );
}

// Registry is shared by parsing, settings, and the command reference.
// Add a definition and a typed command handler to extend the command language.
export const COMMANDS: CommandDefinition[] = [
  {
    id: 'move',
    label: 'Make a move',
    example: 'apex move knight g one f three',
    description:
      'Name the piece, its origin, and destination. Add “promote to knight” for an underpromotion.',
    voice: [[], [literal('to')]].flatMap((connector) => {
      const base = [
        literal('move', { moved: 'move' }),
        pieceSlot,
        ...squareSlots,
        ...connector,
        ...squareSlots,
      ];
      return [
        base,
        ...[
          [promotionSlot],
          [literal('promote'), promotionSlot],
          [literal('promote'), literal('to'), promotionSlot],
          [literal('promotion'), promotionSlot],
        ].map((suffix) => [...base, ...suffix]),
      ];
    }),
    match: (text) => {
      const m = squares(text)
        .replace(/\bnight\b/g, 'knight')
        .match(
          /^move (pawn|knight|bishop|rook|queen|king) ([a-h][1-8]) (?:to )?([a-h][1-8])(?: (?:promote to |promote |promotion )?(queen|rook|bishop|knight))?$/,
        );
      return m
        ? {
            type: 'move',
            piece: pieceCodes[m[1]],
            from: m[2] as Square,
            to: m[3] as Square,
            promotion: m[4] ? (pieceCodes[m[4]] as Promotion) : undefined,
          }
        : null;
    },
  },
  {
    id: 'vision',
    label: 'Inspect a square',
    example: 'apex vision e four',
    description: 'Hear the piece on a square in the current or reviewed position.',
    voice: [[literal('vision'), ...squareSlots]],
    match: (text) => {
      const m = squares(text).match(/^vision ([a-h][1-8])$/);
      return m ? { type: 'vision', square: m[1] as Square } : null;
    },
  },
  {
    id: 'review',
    label: 'Review moves',
    example: 'apex review ten',
    description: 'Start at White’s move number. Without a number, start at move one.',
    voice: [[literal('review')], ...numberPatterns.map((slots) => [literal('review'), ...slots])],
    match: (text) => {
      const m = text.match(/^review(?: (.+))?$/);
      const n = m ? number(m[1] ?? '1') : null;
      return n && n <= 999 ? { type: 'review', move: n } : null;
    },
  },
  {
    id: 'next',
    label: 'Advance review',
    example: 'apex next three',
    description:
      'Advance three individual moves and announce the destination. Without a number, advance one.',
    voice: [[literal('next')], ...numberPatterns.map((slots) => [literal('next'), ...slots])],
    match: (text) => {
      const m = text.match(/^next(?: (.+))?$/);
      const n = m ? number(m[1] ?? '1') : null;
      return n && n <= 999 ? { type: 'next', count: n } : null;
    },
  },
  {
    id: 'returnToPlay',
    label: 'Return to play',
    example: 'apex return to play',
    description: 'Leave review and resume the open game at its latest position.',
    voice: [[literal('return'), literal('to'), literal('play')]],
    match: (text) => (text === 'return to play' ? { type: 'returnToPlay' } : null),
  },
  {
    id: 'lastMove',
    label: 'Last move',
    example: 'apex last move',
    description:
      'Repeat the latest move in the open game, its color, and whose turn comes next. Also works during review.',
    voice: [[literal('last'), literal('move')]],
    match: (text) => (text === 'last move' ? { type: 'lastMove' } : null),
  },
  {
    id: 'eval',
    label: 'Current evaluation',
    example: 'apex current eval',
    description: 'Ask Stockfish for a quick, maximum-skill assessment of the position.',
    voice: ['eval', 'evaluation'].map((word) => [literal('current'), literal(word)]),
    match: (text) => (/^current (eval|evaluation)$/.test(text) ? { type: 'eval' } : null),
  },
  {
    id: 'newGame',
    label: 'Start a new game',
    example: 'apex new game engine three',
    description: 'After a game ends, start self play or an engine game at level 1–8.',
    voice: [
      [literal('new'), literal('game'), literal('self')],
      ...[[], [levelSlot], [literal('full'), literal('power')]].map((suffix) => [
        literal('new'),
        literal('game'),
        literal('engine'),
        ...suffix,
      ]),
    ],
    match: (text) => {
      if (text === 'new game self') return { type: 'newGame', mode: 'self', level: 3 };
      const m = text.match(/^new game engine(?: (.+))?$/);
      const aliases: Record<string, number> = { easy: 1, medium: 3, strong: 6, 'full power': 8 };
      const n = m ? (aliases[m[1]] ?? number(m[1] ?? '3')) : null;
      return n && n <= 8 ? { type: 'newGame', mode: 'engine', level: n } : null;
    },
  },
];
export function parseCommand(raw: string, requireWakeWord = false): Command | null {
  let text = normalize(raw);
  if (requireWakeWord && !text.startsWith('apex ')) return null;
  text = text.replace(/^apex\s+/, '');
  for (const definition of COMMANDS) {
    const command = definition.match(text);
    if (command) return command;
  }
  return null;
}

export function speechVocabulary(): string[] {
  // [unk] gives the recognizer an escape route for background conversation.
  return [
    'apex',
    'return',
    'play',
    'last',
    'move',
    'pawn',
    'knight',
    'bishop',
    'rook',
    'queen',
    'king',
    'to',
    'a',
    'b',
    'c',
    'd',
    'e',
    'f',
    'g',
    'h',
    'vision',
    'review',
    'next',
    'current',
    'eval',
    'evaluation',
    'new',
    'game',
    'self',
    'engine',
    'easy',
    'medium',
    'strong',
    'full',
    'power',
    'promote',
    ...Object.keys(numberWords),
    '[unk]',
  ];
}
