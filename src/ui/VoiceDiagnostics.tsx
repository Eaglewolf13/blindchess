import { useSyncExternalStore } from 'react';
import type { LocalSpeechInput } from '../adapters/speech';

export function VoiceDiagnostics({ speech }: { speech: LocalSpeechInput }) {
  const state = useSyncExternalStore(speech.subscribe, speech.getSnapshot);
  return (
    <section className="card voice-diagnostics" aria-label="Voice diagnostics">
      <div className="section-heading">
        <h2>Voice diagnostics</h2>
        <button className="text-button" onClick={speech.clear}>
          Clear log
        </button>
      </div>
      <div className="voice-meter-row">
        <label htmlFor="voice-level">Microphone level</label>
        <meter id="voice-level" min="0" max="1" value={state.level} />
        <span>{Math.round(state.level * 100)}%</span>
      </div>
      <p className="diagnostic-status" role="status">
        {state.status}
      </p>
      <p className="partial-transcript">
        <strong>In progress: </strong>
        {state.partial || 'Waiting for speech. Whisper shows a transcript after you pause.'}
      </p>
      <details>
        <summary>Reading this panel</summary>
        <p className="muted">
          A flat meter means no microphone signal. A partial transcript is a draft, never a command.
          Pause briefly at the end of a sentence. Final transcripts below show why input was handled
          or rejected. Low Vosk word scores can be tested with a lower threshold in Settings; this
          also increases accidental commands. Whisper does not provide comparable word scores.
        </p>
        <p className="muted">
          Announcements suppress input to avoid hearing themselves. Wait until the status says
          listening, or mute spoken responses to speak without those pauses. Only the latest 60
          events are kept in memory; reloading or Clear log removes them. Audio is never saved.
        </p>
      </details>
      <ol className="voice-log" aria-label="Recognition events">
        {state.events.length === 0 && <li>No completed utterances yet.</li>}
        {state.events.map((event) => (
          <li key={event.id}>
            <time>
              {event.time} · {event.recognizer}
            </time>
            {event.text && <q>{event.text}</q>}
            <span>{event.detail}</span>
            {!!event.words?.length && (
              <small>
                Word scores:{' '}
                {event.words
                  .map(({ word, conf }) => `${word} ${Math.round(conf * 100)}%`)
                  .join(' · ')}
              </small>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
