import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Download, LoaderCircle, Mic, X } from 'lucide-react';
import type { GameConfig, GameMode } from '../domain/types';
import { RECOGNIZERS, type RecognizerChoice } from '../adapters/offline';

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="modal-content">
        <div className="section-heading">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function NewGameModal({
  onClose,
  onStart,
  hasProgress,
  initial,
}: {
  onClose: () => void;
  onStart: (config: GameConfig) => void;
  hasProgress: boolean;
  initial: GameConfig;
}) {
  const [mode, setMode] = useState<GameMode>(initial.mode);
  const [level, setLevel] = useState(initial.level);
  const [color, setColor] = useState(initial.playerColor);
  return (
    <Modal title="A fresh perspective." onClose={onClose}>
      <p className="muted">Choose your practice partner. Take all the time you need.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onStart({ mode, level, playerColor: color });
        }}
      >
        <div className="mode-options">
          <label className={mode === 'self' ? 'chosen' : ''}>
            <input
              type="radio"
              name="mode"
              value="self"
              checked={mode === 'self'}
              onChange={() => setMode('self')}
            />
            <span className="mode-piece">♙</span>
            <strong>Self play</strong>
            <span>Explore both sides.</span>
          </label>
          <label className={mode === 'engine' ? 'chosen' : ''}>
            <input
              type="radio"
              name="mode"
              value="engine"
              checked={mode === 'engine'}
              onChange={() => setMode('engine')}
            />
            <span className="mode-piece">♞</span>
            <strong>Play Stockfish</strong>
            <span>A challenge at your pace.</span>
          </label>
        </div>
        {mode === 'engine' && (
          <div className="engine-options">
            <label>
              Engine strength
              <select
                aria-label="Engine strength"
                value={level}
                onChange={(event) => setLevel(Number(event.target.value))}
              >
                {[
                  '1 · Gentle',
                  '2 · Beginner',
                  '3 · Casual',
                  '4 · Balanced',
                  '5 · Challenging',
                  '6 · Strong',
                  '7 · Expert',
                  '8 · Full skill',
                ].map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Your side
              <select
                aria-label="Your side"
                value={color}
                onChange={(event) => setColor(event.target.value as 'w' | 'b')}
              >
                <option value="w">White · move first</option>
                <option value="b">Black · move second</option>
              </select>
            </label>
            <p className="tiny">
              Level 8 uses the local engine’s maximum skill within a short time limit. Beginner
              levels include deliberate mistakes.
            </p>
          </div>
        )}
        {hasProgress && (
          <p className="save-note">
            Your current game is saved. You can return to it from My games.
          </p>
        )}
        <button className="button primary full-width" type="submit">
          Start practicing
          <ArrowRight size={17} />
        </button>
      </form>
    </Modal>
  );
}
export function VoiceModal({
  recognizer,
  onClose,
  ready,
  error,
  progress,
  onDownload,
  onStart,
}: {
  recognizer: RecognizerChoice;
  onClose: () => void;
  ready: boolean;
  error: string | null;
  progress: number | null;
  onDownload: () => void;
  onStart: () => void;
}) {
  return (
    <Modal title="Your voice. Your move." onClose={onClose}>
      <div className="modal-voice-icon">
        <Mic size={32} />
      </div>
      <p>
        Download the English voice pack once. Your microphone audio is then recognized entirely on
        this device—even offline.
      </p>
      <div className="download-detail">
        <span>{RECOGNIZERS[recognizer].label}</span>
        <strong>{ready ? 'Ready to listen' : RECOGNIZERS[recognizer].size}</strong>
      </div>
      <p className="tiny">
        Allow microphone access when prompted. Keep the app open while playing. You can pause
        listening at any time.
      </p>
      {progress !== null && (
        <progress max="100" value={progress} aria-label="Voice pack download progress" />
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button primary full-width"
        disabled={progress !== null}
        onClick={ready ? onStart : onDownload}
      >
        {progress !== null ? (
          <LoaderCircle className="spin" size={18} />
        ) : ready ? (
          <Mic size={18} />
        ) : (
          <Download size={18} />
        )}
        {progress !== null
          ? `Downloading · ${progress}%`
          : ready
            ? 'Enable microphone'
            : 'Download voice pack'}
      </button>
    </Modal>
  );
}
