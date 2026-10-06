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
          <option value="letters-spaced">Letters · adjustable gap</option>
          <option value="phonetic">Phonetic spellings · previous method</option>
        </select>
      </label>
      <p className="muted">
        {settings.speechPronunciation === 'letters'
          ? 'Reads capital letters, such as “E, three to F, two”, in one sentence. The voice controls the short punctuation pauses; there is no added timer.'
          : settings.speechPronunciation === 'letters-spaced'
            ? 'Reads capital letters with a separate rank and an adjustable extra gap. Your system voice may also add a pause.'
            : 'Uses the earlier ay / bee / see / dee / ee / eff spellings. Some voices spell these out instead. The previous extra gap was 160 ms.'}
      </p>
      {settings.speechPronunciation !== 'letters' && (
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
            Try 0–60 ms first. This is added to the voice’s own pause, so zero may still have a gap.
            Use the flowing sentence if that pause is too long.
          </span>
        </label>
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
