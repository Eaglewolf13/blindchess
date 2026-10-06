import { DEFAULT_SETTINGS, type SpeechPreferences } from '../domain/types';

export interface SpeechSegment {
  text: string;
  pauseBeforeMs: number;
}

/** Synthesis-only formatting; screen text and PGN remain unchanged. */
export function pronunciationSegments(
  text: string,
  preferences: Pick<
    SpeechPreferences,
    'speechPronunciation' | 'speechBeforeSquareMs' | 'speechGapMs'
  > = DEFAULT_SETTINGS,
): SpeechSegment[] {
  const { speechPronunciation, speechBeforeSquareMs, speechGapMs } = preferences;
  const ranks = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  if (speechPronunciation === 'letters') {
    // One utterance avoids OS startup/tail silence at every file/rank boundary.
    // Do not add punctuation between file and rank.
    const sentence = text
      .replace(
        /\b([a-h])\s*([1-8])\b/gi,
        (_, file: string, rank: string) => `${file.toUpperCase()} ${ranks[Number(rank) - 1]}`,
      )
      .trim();
    return sentence ? [{ text: sentence, pauseBeforeMs: 0 }] : [];
  }
  const segments: SpeechSegment[] = [];
  const append = (part: string, pauseBeforeMs: number) => {
    const text = part.trim();
    if (!text) return;
    const previous = segments.at(-1);
    // A zero gap means no synthesis boundary, not merely a zero-delay timer.
    if (previous && pauseBeforeMs === 0) previous.text += ` ${text}`;
    else segments.push({ text, pauseBeforeMs: previous ? pauseBeforeMs : 0 });
  };
  let offset = 0,
    rest = '',
    restPause = 0;
  for (const match of text.matchAll(/\b([a-h])\s*([1-8])\b/gi)) {
    append(`${rest}${text.slice(offset, match.index)}`, restPause);
    append(match[1].toUpperCase(), speechBeforeSquareMs);
    rest = ranks[Number(match[2]) - 1];
    restPause = speechGapMs;
    offset = match.index! + match[0].length;
  }
  append(`${rest}${text.slice(offset)}`, restPause);
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
