/** Phonetic file names are for synthesis only; screen text and PGN remain unchanged. */
export function pronunciationText(text: string): string {
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
  return text.replace(
    /\b([a-h])\s*([1-8])\b/gi,
    (_, file: string, rank: string) => `${files[file.toLowerCase()]} ${ranks[Number(rank) - 1]}`,
  );
}

export function rejectionReason(
  text: string,
  words: { conf: number }[],
  threshold: number,
): string | null {
  if (!text.trim()) return 'No words recognized.';
  if (text.includes('[unk]')) return 'Unknown sound or word ([unk]); command not executed.';
  if (words.some((word) => word.conf < threshold))
    return `Word confidence below ${Math.round(threshold * 100)}%; command not executed. Retry or compare recognition modes in Settings.`;
  return null;
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
