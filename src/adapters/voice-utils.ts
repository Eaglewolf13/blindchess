import type { SpeechPreferences } from '../domain/types';

/** Synthesis-only formatting; screen text and PGN remain unchanged. */
export function pronunciationSegments(
  text: string,
  mode: SpeechPreferences['speechPronunciation'] = 'letters',
): string[] {
  const files: Record<string, string> = {
    a: 'ay',
    b: 'bee',
    c: 'see',
    d: 'dee',
    e: 'ee',
    f: 'eff',
    g: 'jee',
    h: 'aitch',
  };
  const ranks = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  if (mode === 'letters') {
    // One utterance avoids OS startup/tail silence at every file/rank boundary.
    // A comma suggests a short pause; the selected system voice controls its duration.
    const sentence = text
      .replace(
        /\b([a-h])\s*([1-8])\b/gi,
        (_, file: string, rank: string) => `${file.toUpperCase()}, ${ranks[Number(rank) - 1]}`,
      )
      .trim();
    return sentence ? [sentence] : [];
  }
  const segments: string[] = [];
  let offset = 0,
    rest = '';
  for (const match of text.matchAll(/\b([a-h])\s*([1-8])\b/gi)) {
    segments.push(
      `${rest}${text.slice(offset, match.index)}${mode === 'phonetic' ? files[match[1].toLowerCase()] : match[1].toUpperCase()}`.trim(),
    );
    rest = ranks[Number(match[2]) - 1];
    offset = match.index! + match[0].length;
  }
  const tail = `${rest}${text.slice(offset)}`.trim();
  if (tail) segments.push(tail);
  return segments;
}
/** Simple energy-based endpointing for Whisper, with pre-roll and bounded memory. */
export class UtteranceBuffer {
  private chunks: Float32Array[] = [];
  private preRoll: Float32Array[] = [];
  private frames = 0;
  private quiet = 0;
  private voiced = 0;
  constructor(private rate: number) {}
  reset() {
    this.chunks = [];
    this.preRoll = [];
    this.frames = this.quiet = this.voiced = 0;
  }
  push(data: Float32Array, rms: number): Float32Array | null {
    const voice = rms >= 0.012;
    if (!this.chunks.length && !voice) {
      this.preRoll.push(data);
      while (this.preRoll.length * data.length > this.rate * 0.25) this.preRoll.shift();
      return null;
    }
    if (!this.chunks.length) {
      this.chunks.push(...this.preRoll);
      this.preRoll = [];
    }
    this.chunks.push(data);
    this.frames += data.length;
    this.quiet = voice ? 0 : this.quiet + data.length;
    if (voice) this.voiced += data.length;
    if (this.quiet < this.rate * 0.9 && this.frames < this.rate * 12) return null;
    const chunks = this.chunks;
    const voiced = this.voiced;
    this.reset();
    if (voiced < this.rate * 0.2) return null;
    const result = new Float32Array(chunks.reduce((n, chunk) => n + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}
