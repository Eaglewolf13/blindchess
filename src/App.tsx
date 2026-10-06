import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  CircleHelp,
  Command,
  Download,
  LayoutGrid,
  Mic,
  MicOff,
  Plus,
  Settings2,
  Sparkles,
  UserRound,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import type { AppController } from './application/controller';
import type { LocalSpeechInput } from './adapters/speech';
import { downloadSpeechModel, hasSpeechModel, type RecognizerChoice } from './adapters/offline';
import { VoiceDiagnostics } from './ui/VoiceDiagnostics';
import { Play } from './ui/Play';
import { Guide, Library, SettingsPage, savePgn } from './ui/Pages';
import { NewGameModal, VoiceModal } from './ui/Modal';
import { PendingVoiceCommand } from './ui/VoiceDiagnostics';

type Page = 'practice' | 'library' | 'commands' | 'settings';
const pageNames: Record<Page, string> = {
  practice: 'Your mind. Your board.',
  library: 'A record of your thinking.',
  commands: 'Let your voice lead.',
  settings: 'Make yourself at home.',
};

export default function App({
  controller,
  speech,
}: {
  controller: AppController;
  speech: LocalSpeechInput;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [page, setPage] = useState<Page>('practice');
  const [newGameOpen, setNewGameOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  const [micStatus, setMicStatus] = useState('');
  const [modelReady, setModelReady] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<
    (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null
  >(null);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ onOfflineReady: () => setAppReady(true) });
  useEffect(() => {
    void controller.initialize();
  }, [controller]);
  useEffect(() => {
    speech.resetCommand('The game position or voice settings changed.');
  }, [
    speech,
    state.game.id,
    state.game.revision,
    state.reviewPly,
    state.settings.requireWakeWord,
    state.settings.voiceConfidence,
  ]);
  useEffect(() => {
    if ('serviceWorker' in navigator && 'caches' in window)
      void navigator.serviceWorker.ready
        .then(async () => {
          const app = await caches.match('/index.html', { ignoreSearch: true });
          const engine = await caches.match('/engine/stockfish.wasm', { ignoreSearch: true });
          setAppReady(!!app && !!engine);
        })
        .catch(() => {});
    const connection = () => setOnline(navigator.onLine);
    const returned = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setMicOn(false);
        setMicBusy(false);
        setMicStatus('Enable the microphone to resume listening.');
      }
    };
    const install = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as typeof installPrompt);
    };
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    window.addEventListener('beforeinstallprompt', install);
    window.addEventListener('pageshow', returned);
    return () => {
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
      window.removeEventListener('beforeinstallprompt', install);
      window.removeEventListener('pageshow', returned);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setModelReady(false);
    void hasSpeechModel(state.settings.speechRecognizer)
      .then((ready) => {
        if (!cancelled) setModelReady(ready);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [state.settings.speechRecognizer]);
  async function selectRecognizer(speechRecognizer: RecognizerChoice) {
    await speech.stop();
    setMicOn(false);
    setMicStatus('Recognizer changed. Enable the microphone to start.');
    setVoiceError(null);
    await controller.setSettings({ speechRecognizer });
  }
  async function download() {
    if (downloadProgress !== null) return;
    setDownloadProgress(0);
    setVoiceError(null);
    try {
      await downloadSpeechModel(setDownloadProgress, state.settings.speechRecognizer);
      setModelReady(true);
    } catch (error) {
      setVoiceError(
        error instanceof Error ? error.message : 'Voice download failed. Please try again.',
      );
      controller.reportError(error);
    } finally {
      setDownloadProgress(null);
    }
  }
  async function microphone() {
    if (micBusy) return;
    if (micOn) {
      await speech.stop();
      setMicOn(false);
      setMicStatus('Microphone paused.');
      return;
    }
    if (!modelReady) {
      setVoiceError(null);
      setVoiceOpen(true);
      return;
    }
    setVoiceOpen(false);
    setMicBusy(true);
    try {
      await speech.start(
        (text) => controller.executeText(text, 'voice'),
        (status) => {
          setMicStatus(status);
          if (/^(Voice input stopped|Microphone (disconnected|suspended))/i.test(status))
            setMicOn(false);
        },
        () => controller.getSnapshot().settings,
      );
      setMicOn(true);
    } catch (error) {
      setMicOn(false);
      const message =
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? new Error(
              'Microphone permission was denied. Allow it in your browser’s site settings, then try again.',
            )
          : error;
      controller.reportError(message);
    } finally {
      setMicBusy(false);
    }
  }
  const nav = [
    { id: 'practice' as const, label: 'Practice room', icon: LayoutGrid },
    { id: 'library' as const, label: 'My games', icon: BookOpen },
    { id: 'commands' as const, label: 'Command guide', icon: Command },
    { id: 'settings' as const, label: 'Settings', icon: Settings2 },
  ];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <button className="brand" aria-label="Apex home" onClick={() => setPage('practice')}>
          <img src="/favicon.svg" alt="" />
          <span>
            apex<span className="brand-dot">.</span>
          </span>
        </button>
        <span className="brand-caption">CHESS, IN YOUR MIND.</span>
        <div className="nav-label small-caps">YOUR SPACE</div>
        <nav aria-label="Main navigation">
          {nav.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => setPage(item.id)}
            >
              <item.icon size={19} strokeWidth={1.7} />
              <span>{item.label}</span>
              {page === item.id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <Sparkles size={19} strokeWidth={1.5} />
            <p>
              Good moves begin
              <br />
              before you see them.
            </p>
            <span>A little practice, every day.</span>
          </div>
          <button className="offline-nav" onClick={() => setPage('settings')}>
            <span className="offline-nav-icon">
              <Download size={17} />
            </span>
            <span>
              <strong>{appReady ? 'Ready to go offline' : 'Practice anywhere'}</strong>
              <small>{modelReady ? 'Voice pack downloaded' : 'Prepare your offline pack'}</small>
            </span>
            <ChevronRight size={15} />
          </button>
          <div className="local-profile">
            <span className="profile-avatar">
              <UserRound size={19} />
            </span>
            <div>
              <strong>Local player</strong>
              <span>Your own quiet corner.</span>
            </div>
            <span className="local-badge">YOU</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Your space
            <ChevronRight size={13} />
            <strong>{nav.find((item) => item.id === page)?.label}</strong>
          </div>
          <div className="topbar-actions">
            {page !== 'practice' && (
              <button
                className="icon-button"
                aria-label={micOn ? 'Pause voice input' : 'Enable voice input'}
                disabled={micBusy}
                onClick={() => void microphone()}
              >
                {micOn ? <Mic size={18} /> : <MicOff size={18} />}
              </button>
            )}
            <span className="connection">
              {online ? <Wifi size={14} /> : <WifiOff size={14} />}
              {online ? 'Local practice' : 'Offline'}
            </span>
            <button
              className="icon-button"
              aria-label={
                state.settings.sound ? 'Mute spoken responses' : 'Enable spoken responses'
              }
              title={state.settings.sound ? 'Mute spoken responses' : 'Enable spoken responses'}
              onClick={() => void controller.setSettings({ sound: !state.settings.sound })}
            >
              {state.settings.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button
              className="icon-button help-top"
              aria-label="Open command guide"
              onClick={() => setPage('commands')}
            >
              <CircleHelp size={18} />
            </button>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span />
                {page === 'practice'
                  ? 'THE PRACTICE ROOM'
                  : page === 'library'
                    ? 'YOUR CHESS JOURNAL'
                    : page === 'commands'
                      ? 'A SMALL VOCABULARY. A BIG BOARD.'
                      : 'THE LITTLE DETAILS'}
              </div>
              <h1>{pageNames[page]}</h1>
              {page === 'practice' && (
                <p>Less looking. More seeing. A little better, one move at a time.</p>
              )}
            </div>
            {page === 'practice' && (
              <div className="heading-actions">
                <button
                  className="icon-button export-current"
                  title="Download current game as PGN"
                  aria-label="Download current game as PGN"
                  disabled={!state.game.moves.length}
                  onClick={() => savePgn(controller)}
                >
                  <ArrowDownToLine size={19} />
                </button>
                <button
                  className="button primary"
                  disabled={!state.ready || !state.settings.enabledCommands.newGame}
                  onClick={() => setNewGameOpen(true)}
                >
                  <Plus size={17} />
                  New game
                </button>
              </div>
            )}
          </div>
          {state.storageError && (
            <div className="notice error" role="alert">
              {state.storageError}
            </div>
          )}
          {state.settings.voiceDebug && <VoiceDiagnostics speech={speech} />}
          <PendingVoiceCommand speech={speech} />
          {needRefresh && (
            <div className="notice">
              <span>A new version is ready. Your saved games will be kept.</span>
              <button className="text-button" onClick={() => void updateServiceWorker(true)}>
                Update & reload
                <ArrowUpRight size={15} />
              </button>
              <button
                className="icon-button"
                aria-label="Dismiss update"
                onClick={() => setNeedRefresh(false)}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!state.ready ? (
            <div className="loading-state">Opening your practice room…</div>
          ) : (
            <>
              {page === 'practice' && (
                <Play
                  state={state}
                  controller={controller}
                  micOn={micOn}
                  micBusy={micBusy}
                  micStatus={micStatus}
                  onMic={() => void microphone()}
                  onCommands={() => setPage('commands')}
                />
              )}
              {page === 'library' && (
                <Library state={state} controller={controller} onOpen={() => setPage('practice')} />
              )}
              {page === 'commands' && <Guide />}
              {page === 'settings' && (
                <SettingsPage
                  state={state}
                  controller={controller}
                  modelReady={modelReady}
                  appReady={appReady}
                  downloadProgress={downloadProgress}
                  onDownload={() => void download()}
                  onRecognizer={(choice) => void selectRecognizer(choice)}
                  recognizerLocked={micBusy || downloadProgress !== null}
                  micOn={micOn}
                  onMic={() => void microphone()}
                />
              )}
            </>
          )}
          {page !== 'practice' && state.feedback.kind === 'error' && (
            <div className="feedback error" role="alert">
              {state.feedback.text}
            </div>
          )}
          <footer className="main-footer">
            <span>
              <span className="footer-logo">a.</span>A quieter way to play.
            </span>
            <div>
              {installPrompt ? (
                <button
                  className="text-button"
                  onClick={async () => {
                    await installPrompt.prompt();
                    await installPrompt.userChoice;
                    setInstallPrompt(null);
                  }}
                >
                  Install Apex
                  <Download size={13} />
                </button>
              ) : (
                <span>Made for a little daily practice.</span>
              )}
              <span className="footer-version">v0.1 · OFFLINE EDITION</span>
            </div>
          </footer>
        </main>
      </div>
      {newGameOpen && (
        <NewGameModal
          initial={state.game.config}
          hasProgress={state.game.moves.length > 0 && !state.game.result}
          onClose={() => setNewGameOpen(false)}
          onStart={(config) => {
            setNewGameOpen(false);
            void controller.startGame(config);
          }}
        />
      )}
      {voiceOpen && (
        <VoiceModal
          recognizer={state.settings.speechRecognizer}
          onClose={() => setVoiceOpen(false)}
          ready={modelReady}
          error={voiceError}
          progress={downloadProgress}
          onDownload={() => void download()}
          onStart={() => void microphone()}
        />
      )}
    </div>
  );
}
