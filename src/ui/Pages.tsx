import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  Copy,
  Download,
  HardDrive,
  Mic,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { useState } from 'react';
import { COMMANDS } from '../domain/commands';
import type { AppController, AppState } from '../application/controller';
import type { GameRecord } from '../domain/types';

export function savePgn(controller: AppController, game?: GameRecord) {
  const pgn = controller.pgn(game);
  const url = URL.createObjectURL(new Blob([pgn], { type: 'application/x-chess-pgn' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `apex-${(game ?? controller.getSnapshot().game).createdAt.slice(0, 10)}.pgn`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Library({
  state,
  controller,
  onOpen,
}: {
  state: AppState;
  controller: AppController;
  onOpen: () => void;
}) {
  const games = state.games.filter((game) => game.moves.length);
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(game: GameRecord) {
    try {
      await navigator.clipboard.writeText(controller.pgn(game));
      setCopied(game.id);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      controller.reportError(
        new Error('Clipboard access is unavailable. Use Download PGN instead.'),
      );
    }
  }
  return (
    <>
      <div className="page-intro">
        <p>Every move is part of the practice.</p>
        <span className="tag">
          <HardDrive size={14} />
          Saved on this device
        </span>
      </div>
      {games.length === 0 ? (
        <div className="card empty-page">
          <BookOpen size={40} strokeWidth={1} />
          <h2>Your games belong here.</h2>
          <p>
            Play a few moves and your game will be saved automatically.
            <br />
            Come back to replay it, listen to it, or take it with you as a PGN.
          </p>
          <button className="button primary" onClick={onOpen}>
            Back to practice
            <ArrowRight size={17} />
          </button>
        </div>
      ) : (
        <div className="game-list">
          {games.map((game) => (
            <article className="card saved-game" key={game.id}>
              <div className="game-emblem">{game.config.mode === 'engine' ? '♞' : '♙'}</div>
              <div className="saved-details">
                <span className="small-caps">
                  {new Date(game.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                <h2>
                  {game.config.mode === 'self'
                    ? 'A game with yourself'
                    : `Against Stockfish · Level ${game.config.level}`}
                </h2>
                <p>
                  {game.resultText ?? 'In progress'} <span>·</span> {game.moves.length} individual
                  moves
                </p>
              </div>
              <div className="saved-actions">
                <button
                  className="button secondary small"
                  onClick={() => {
                    controller.openGame(game);
                    onOpen();
                  }}
                >
                  Review
                  <ArrowRight size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Copy PGN"
                  title="Copy PGN"
                  onClick={() => void copy(game)}
                >
                  {copied === game.id ? <Check size={17} /> : <Copy size={17} />}
                </button>
                <button
                  className="icon-button"
                  aria-label="Download PGN"
                  title="Download PGN"
                  onClick={() => savePgn(controller, game)}
                >
                  <ArrowDownToLine size={17} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="page-footnote">
        PGN is the standard chess game format. Import it into Lichess, Chess.com, or another
        analysis app. Accounts and shared games are planned for the online release.
      </p>
    </>
  );
}

export function Guide() {
  return (
    <>
      <div className="guide-intro">
        <div className="guide-icon">
          <Mic size={26} />
        </div>
        <div>
          <h2>One sentence. One move.</h2>
          <p>
            Say “apex” and your command together. There’s no need to pause after the wake word. The
            app listens continuously once you enable the microphone.
          </p>
        </div>
      </div>
      <div className="commands-grid">
        {COMMANDS.map((command, index) => (
          <article className="card command-card" key={command.id}>
            <span className="command-number">0{index + 1}</span>
            <h2>{command.label}</h2>
            <code>{command.example}</code>
            <p>{command.description}</p>
          </article>
        ))}
      </div>
      <div className="card guide-details">
        <h2>The finer points</h2>
        <div>
          <p>
            <strong>Castling</strong>Move the king: “apex move king e one g one” for White’s
            kingside castle. The rook follows automatically.
          </p>
          <p>
            <strong>Promotion</strong>A pawn reaching the last rank becomes a queen unless you
            specify a piece: “apex move pawn a seven a eight promote to knight”.
          </p>
          <p>
            <strong>Quiet practice</strong>Every voice command is also available through the
            on-screen controls or the command input. Mute responses in Settings without turning off
            your microphone.
          </p>
          <p>
            <strong>Keep the app open</strong>On phones, locking the screen or switching apps can
            suspend microphone processing. Return here and enable the microphone again if it stops.
          </p>
        </div>
      </div>
    </>
  );
}

export function SettingsPage({
  state,
  controller,
  modelReady,
  appReady,
  downloadProgress,
  onDownload,
}: {
  state: AppState;
  controller: AppController;
  modelReady: boolean;
  appReady: boolean;
  downloadProgress: number | null;
  onDownload: () => void;
}) {
  const { settings } = state;
  return (
    <div className="settings-layout">
      <div>
        <section className="card settings-card">
          <h2>Your practice, your way</h2>
          <p className="muted">Choose what helps you concentrate.</p>
          <Toggle
            label="Spoken responses"
            description="Hear confirmations, opponent moves, and review narration. Your microphone can stay on when this is muted."
            checked={settings.sound}
            onChange={(sound) => void controller.setSettings({ sound })}
          />
          <Toggle
            label="Require “apex” before voice commands"
            description="Recommended to reduce accidental commands during conversation. Say the prefix and command in one sentence."
            checked={settings.requireWakeWord}
            onChange={(requireWakeWord) => void controller.setSettings({ requireWakeWord })}
          />
          <Toggle
            label="Show the board during play"
            description="Keep it hidden to train visualization. Saved-game review always shows the board."
            checked={settings.showBoard}
            onChange={(showBoard) => void controller.setSettings({ showBoard })}
          />
        </section>
        <section className="card settings-card">
          <h2>Training commands</h2>
          <p className="muted">
            Turn off assistance for a tougher session. These switches apply to voice, typed
            commands, and buttons.
          </p>
          {COMMANDS.map((command) => (
            <Toggle
              key={command.id}
              label={command.label}
              description={
                command.id === 'eval'
                  ? 'Disable engine evaluations to trust your own judgment.'
                  : command.description
              }
              checked={settings.enabledCommands[command.id]}
              onChange={(enabled) =>
                void controller.setSettings({
                  enabledCommands: { ...settings.enabledCommands, [command.id]: enabled },
                })
              }
            />
          ))}
        </section>
      </div>
      <aside>
        <section className="card offline-card">
          <div className="offline-icon">
            <WifiOff size={26} />
          </div>
          <h2>Take your practice anywhere.</h2>
          <p>Prepare once while connected. Then play and review without a connection.</p>
          <div className="readiness">
            <span>App & Stockfish</span>
            <strong className={appReady ? 'ready-text' : ''}>
              {appReady
                ? 'Ready offline'
                : import.meta.env.DEV
                  ? 'Available in production build'
                  : 'Preparing…'}
            </strong>
          </div>
          <div className="readiness">
            <span>English voice pack</span>
            <strong className={modelReady ? 'ready-text' : ''}>
              {modelReady ? 'Downloaded' : '39.8 MB'}
            </strong>
          </div>
          <button
            className="button primary"
            disabled={modelReady || downloadProgress !== null}
            onClick={onDownload}
          >
            {modelReady ? <Check size={17} /> : <Download size={17} />}
            {modelReady
              ? 'Voice pack ready'
              : downloadProgress !== null
                ? `Downloading · ${downloadProgress}%`
                : 'Download voice pack'}
          </button>
          {downloadProgress !== null && (
            <progress
              max="100"
              value={downloadProgress}
              aria-label="Voice pack download progress"
            />
          )}
          <p className="tiny">
            Browser storage can be cleared or evicted. Check these indicators before a trip. Spoken
            responses also need an installed English system voice.
          </p>
        </section>
        <section className="privacy-note">
          <ShieldCheck size={20} />
          <div>
            <strong>Just you and the position.</strong>
            <p>
              Speech is processed on your device. Games are stored in this browser. No account or
              audio upload is needed.
            </p>
          </div>
        </section>
      </aside>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        <span>{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}
