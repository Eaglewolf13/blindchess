import { useEffect, useState } from 'react';
import { localEnglishVoices } from '../adapters/speech';
import type { AppController } from '../application/controller';
import type { Settings, SpeechPreferences } from '../domain/types';

/** Listening comparisons use the same output adapter and saved settings as game narration. */
export function SpeechSettings({
  settings,
  controller,
}: {
  settings: Settings;
  controller: AppController;
}) {
  const [voices, setVoices] = useState(localEnglishVoices);
  const supported = 'speechSynthesis' in window;
  useEffect(() => {
    if (!supported) return;
    const refresh = () => setVoices(localEnglishVoices());
    speechSynthesis.addEventListener('voiceschanged', refresh);
    refresh();
    return () => speechSynthesis.removeEventListener('voiceschanged', refresh);
  }, [supported]);
  const missingVoice =
    !!settings.speechVoice && !voices.some((voice) => voice.voiceURI === settings.speechVoice);
  return (
    <section className="card settings-card speech-settings" aria-label="Spoken pronunciation">
      <h2>Spoken pronunciation</h2>
      <p className="muted">
        Compare how your device reads square names. These settings affect announcements only.
      </p>
      <label className="recognizer-label">
        Square pronunciation
        <select
          aria-label="Square pronunciation"
          value={settings.speechPronunciation}
          onChange={(event) =>
            void controller.setSettings({
              speechPronunciation: event.target.value as SpeechPreferences['speechPronunciation'],
            })
          }
        >
          <option value="letters">Letters · flowing sentence</option>
          <option value="letters-spaced">Letters · adjustable gaps</option>
        </select>
      </label>
      <p className="muted">
        {settings.speechPronunciation === 'letters'
          ? 'Reads “bishop E three to F two” as one sentence, with no commas added inside squares and no added timers.'
          : 'Both gaps default to zero, keeping the sentence together with natural spacing. No commas are added. You can still adjust either gap if needed.'}
      </p>
      {settings.speechPronunciation !== 'letters' && (
        <>
          <label className="confidence-control">
            Extra gap before letter: {settings.speechBeforeSquareMs} ms
            <input
              aria-label="Extra gap before letter"
              type="range"
              min="0"
              max="600"
              step="20"
              value={settings.speechBeforeSquareMs}
              onChange={(event) =>
                void controller.setSettings({ speechBeforeSquareMs: Number(event.target.value) })
              }
            />
            <span className="tiny">
              Controls “pawn → A” and “to → A”. Zero keeps the preceding words and letter in the
              same speech chunk.
            </span>
          </label>
          <label className="confidence-control">
            Extra letter–number gap: {settings.speechGapMs} ms
            <input
              aria-label="Extra letter–number gap"
              type="range"
              min="0"
              max="300"
              step="20"
              value={settings.speechGapMs}
              onChange={(event) =>
                void controller.setSettings({ speechGapMs: Number(event.target.value) })
              }
            />
            <span className="tiny">
              Controls “A → two”. Zero keeps “A two” together in one speech chunk. Positive gaps add
              to the system voice’s own pauses between chunks.
            </span>
          </label>
        </>
      )}
      <label className="recognizer-label">
        Installed English voice
        <select
          aria-label="Installed English voice"
          value={settings.speechVoice}
          onChange={(event) => void controller.setSettings({ speechVoice: event.target.value })}
        >
          <option value="">Automatic</option>
          {missingVoice && (
            <option value={settings.speechVoice}>Saved voice unavailable · using automatic</option>
          )}
          {voices.map((voice) => (
            <option key={voice.voiceURI} value={voice.voiceURI}>
              {voice.name} ({voice.lang})
            </option>
          ))}
        </select>
      </label>
      {!voices.length && (
        <p className="tiny">
          No installed English voices reported yet. Automatic uses the browser’s default; install an
          English system voice for offline narration.
        </p>
      )}
      <p className="tiny">
        The test reads a2 → a4, bishop e3 → f2, and king f8 → d8. Changes are saved and apply to the
        next announcement.
      </p>
      <div className="speech-test-actions">
        <button
          className="button secondary"
          disabled={!supported || !settings.sound}
          onClick={() => controller.previewSpeech()}
        >
          Test pronunciation
        </button>
        <button
          className="button secondary"
          disabled={!supported}
          onClick={() => controller.stopSpeechPreview()}
        >
          Stop test
        </button>
      </div>
      {!supported ? (
        <p className="tiny">This browser does not provide speech output.</p>
      ) : (
        !settings.sound && <p className="tiny">Turn on Spoken responses to hear the test.</p>
      )}
    </section>
  );
}
