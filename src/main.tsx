import { createRoot } from 'react-dom/client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import App from './App';
import { AppController } from './application/controller';
import { IndexedDbRepository } from './adapters/storage';
import { StockfishEngine } from './adapters/engine';
import { BrowserSpeechOutput, LocalSpeechInput } from './adapters/speech';
import { GuestRepository } from './adapters/guest-storage';
import { AccountStorage } from './adapters/account-storage';
import { FirebaseHistory } from './adapters/firebase-history';
import { SyncedRepository } from './application/synced-repository';
import { Accounts } from './application/accounts';
import { AccountModal, SyncNotice } from './ui/Account';
import './styles.css';

const accounts = new Accounts();

function Workspace({
  ownerId,
  username,
  openAccount,
}: {
  ownerId: string | null;
  username: string | null;
  openAccount: () => void;
}) {
  const [services] = useState(() => {
    const output = new BrowserSpeechOutput();
    const engine = new StockfishEngine();
    const input = new LocalSpeechInput(output);
    const sync = ownerId
      ? new SyncedRepository(
          new AccountStorage(ownerId),
          new FirebaseHistory(ownerId),
          new IndexedDbRepository(),
        )
      : null;
    return {
      output,
      engine,
      input,
      sync,
      controller: new AppController(sync ?? new GuestRepository(), engine, output),
    };
  });
  useEffect(() => {
    services.sync?.start();
    const pagehide = () => {
      void services.input.stop();
      services.output.stop();
      services.engine.dispose();
    };
    window.addEventListener('pagehide', pagehide);
    return () => {
      window.removeEventListener('pagehide', pagehide);
      services.sync?.stop();
      services.controller.dispose();
      pagehide();
    };
  }, [services]);
  return (
    <App
      controller={services.controller}
      speech={services.input}
      accountName={ownerId ? (username ?? 'Your account') : null}
      onAccount={openAccount}
      syncNotice={services.sync ? <SyncNotice repository={services.sync} /> : undefined}
    />
  );
}
function Root() {
  const account = useSyncExternalStore(accounts.subscribe, accounts.getSnapshot);
  const [accountOpen, setAccountOpen] = useState(false);
  if (!account.ready) return <div className="loading-state">Opening your practice room…</div>;
  return (
    <>
      {account.error && (
        <div className="notice error" role="alert">
          {account.error}
        </div>
      )}
      <Workspace
        key={account.user?.id ?? 'guest'}
        ownerId={account.user?.id ?? null}
        username={account.user?.username ?? null}
        openAccount={() => setAccountOpen(true)}
      />
      {accountOpen && <AccountModal accounts={accounts} onClose={() => setAccountOpen(false)} />}
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Root />);
