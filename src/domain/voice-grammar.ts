/** Slots describe valid continuations, separate from acoustic model confidence. */
export interface VoiceSlot {
  label: string;
  match: (word: string) => string | null;
}
export type VoicePattern = readonly VoiceSlot[];
export function choices(
  label: string,
  words: readonly string[],
  aliases: Record<string, string> = {},
): VoiceSlot {
  return {
    label,
    match: (word) =>
      words.includes(word) ? word : Object.hasOwn(aliases, word) ? aliases[word] : null,
  };
}
export const literal = (word: string, aliases: Record<string, string> = {}) =>
  choices(`“${word}”`, [word], aliases);
export const pieceSlot = choices(
  'a piece: pawn, knight, bishop, rook, queen, or king',
  ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'],
  { night: 'knight', bond: 'pawn', bon: 'pawn', on: 'pawn' },
);
export const promotionSlot = choices(
  'a promotion piece: queen, rook, bishop, or knight',
  ['queen', 'rook', 'bishop', 'knight'],
  { night: 'knight' },
);
export const fileSlot = choices('a file letter, a through h', [...'abcdefgh'], {
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
});
const ones = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
export const rankSlot = choices('a rank, one through eight', ones.slice(0, 8), {
  ...Object.fromEntries(ones.slice(0, 8).map((word, i) => [String(i + 1), word])),
  to: 'two',
  too: 'two',
  for: 'four',
  ate: 'eight',
});
export const squareSlots = [fileSlot, rankSlot] as const;
const tens = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const small = [
  ...ones,
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  ...tens,
];
const digitNumber: VoiceSlot = {
  label: 'a move number, 1 through 999',
  match: (word) => (/^[1-9]\d{0,2}$/.test(word) ? word : null),
};
const one = choices('one through nine', ones);
const ten = choices('twenty, thirty, … ninety', tens);
const smallNumber = choices('a number', small);
export const numberPatterns: VoicePattern[] = [
  [digitNumber],
  [smallNumber],
  [ten, one],
  [one, literal('hundred')],
  [one, literal('hundred'), smallNumber],
  [one, literal('hundred'), ten, one],
];
export const levelSlot = choices(
  'an engine level, one through eight, easy, medium, or strong',
  [...ones.slice(0, 8), 'easy', 'medium', 'strong'],
  Object.fromEntries(ones.slice(0, 8).map((word, i) => [String(i + 1), word])),
);

export interface SpeechWord {
  word: string;
  conf?: number;
}
export function voiceTokens(text: string, words?: readonly SpeechWord[]): SpeechWord[] {
  // Preserve each acoustic score when a written coordinate expands into two slots.
  const input = words?.length ? words : [{ word: text }];
  return input.flatMap(({ word, conf }) =>
    word
      .toLowerCase()
      .replace(/[.,!?;:\-]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .flatMap((token) => {
        if (/^(?:[a-h][1-8])+$/.test(token)) return [...token].map((word) => ({ word, conf }));
        return [{ word: token, conf }];
      }),
  );
}
