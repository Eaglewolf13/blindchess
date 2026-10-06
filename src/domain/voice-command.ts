import { COMMANDS, parseCommand } from './commands';
import { voiceTokens, type SpeechWord, type VoicePattern } from './voice-grammar';

export interface VoiceDecision {
  kind: 'ignored' | 'pending' | 'command';
  detail: string;
  commandText?: string;
  pending: string;
  expected: string[];
}
interface Candidate {
  pattern: VoicePattern;
  tokens: string[];
}
/** Consumes finalized ASR segments, never revisable partial hypotheses. Silence is a no-op. */
export class VoiceCommandAssembler {
  private active = false;
  private candidates: Candidate[] = [];
  reset() {
    this.active = false;
    this.candidates = [];
  }
  get pending() {
    return this.active ? ['apex', ...(this.candidates[0]?.tokens ?? [])].join(' ') : '';
  }
  get expected() {
    return [
      ...new Set(
        this.candidates.flatMap(({ pattern, tokens }) =>
          pattern[tokens.length] ? [pattern[tokens.length].label] : [],
        ),
      ),
    ];
  }
  private begin() {
    this.active = true;
    this.candidates = COMMANDS.flatMap(({ voice }) =>
      voice.map((pattern) => ({ pattern, tokens: [] })),
    );
  }
  private decision(
    kind: VoiceDecision['kind'],
    detail: string,
    commandText?: string,
  ): VoiceDecision {
    return { kind, detail, commandText, pending: this.pending, expected: this.expected };
  }
  accept(
    text: string,
    words: readonly SpeechWord[] | undefined,
    options: { requireWakeWord: boolean; voiceConfidence: number },
  ): VoiceDecision {
    let tokens = voiceTokens(text, words);
    if (!tokens.length)
      return this.decision(
        this.active ? 'pending' : 'ignored',
        this.active ? 'Waiting for the rest of the command.' : 'No words recognized.',
      );
    // Only an actual, confident wake word opens/restarts a command. Never map "next" to "apex".
    const wake = tokens.map(({ word }) => word).lastIndexOf('apex');
    if (wake >= 0) {
      this.reset();
      if ((tokens[wake].conf ?? 1) < options.voiceConfidence)
        return this.decision(
          'ignored',
          'Ignored: wake word confidence is below the selected minimum.',
        );
      this.begin();
      tokens = tokens.slice(wake + 1); // Pre-wake noise and its scores are irrelevant.
    } else if (!this.active) {
      if (options.requireWakeWord) return this.decision('ignored', 'Ignored: waiting for “apex”.');
      this.begin();
    }
    const corrections: string[] = [];
    const skipped: string[] = [];
    for (const token of tokens) {
      if (token.word === '[unk]' || (token.conf ?? 1) < options.voiceConfidence) {
        // User-selected behavior: keep waiting for this slot, including within this segment.
        const reason =
          token.word === '[unk]'
            ? 'Unknown sound ([unk])'
            : `“${token.word}” scored below ${Math.round(options.voiceConfidence * 100)}%`;
        skipped.push(reason);
        continue;
      }
      const next: Candidate[] = [];
      for (const { pattern, tokens: prefix } of this.candidates) {
        const normalized = pattern[prefix.length]?.match(token.word);
        if (normalized) next.push({ pattern, tokens: [...prefix, normalized] });
      }
      if (!next.length) {
        const expected = this.expected.join(' or ') || 'the end of the command';
        skipped.push(`“${token.word}” did not fit ${expected}`);
        continue;
      }
      this.candidates = next;
      const normalized = next[0].tokens.at(-1)!;
      if (normalized !== token.word) corrections.push(`“${token.word}” → “${normalized}”`);
    }
    const notes =
      (corrections.length ? ` Mapped ${corrections.join(', ')} in their slots.` : '') +
      (skipped.length ? ` Skipped: ${skipped.join('; ')}.` : '');
    const complete = this.candidates.find(
      ({ pattern, tokens }) => pattern.length === tokens.length && parseCommand(tokens.join(' ')),
    );
    if (complete) {
      const commandText = `apex ${complete.tokens.join(' ')}`;
      this.reset();
      return this.decision('command', 'Complete command.' + notes, commandText);
    }
    return this.decision(
      'pending',
      `Command not executed yet. Kept “${this.pending}”. Waiting for ${this.expected.join(' or ')}. You can pause, then continue.` +
        notes,
    );
  }
}
