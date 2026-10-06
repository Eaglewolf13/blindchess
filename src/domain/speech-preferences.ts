import { DEFAULT_SETTINGS, type SpeechPreferences } from './types';

/** Old saved phonetic mode falls back to letters; existing numeric gap choices are retained. */
export function normalizeSpeechPreferences(
  saved: Partial<Record<keyof SpeechPreferences, unknown>>,
): SpeechPreferences {
  const gap = (value: unknown, fallback: number, maximum: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, Math.min(maximum, value))
      : fallback;
  return {
    speechPronunciation:
      saved.speechPronunciation === 'letters-spaced' ? 'letters-spaced' : 'letters',
    speechBeforeSquareMs: gap(
      saved.speechBeforeSquareMs,
      DEFAULT_SETTINGS.speechBeforeSquareMs,
      600,
    ),
    speechGapMs: gap(saved.speechGapMs, DEFAULT_SETTINGS.speechGapMs, 300),
    speechVoice: typeof saved.speechVoice === 'string' ? saved.speechVoice : '',
  };
}
