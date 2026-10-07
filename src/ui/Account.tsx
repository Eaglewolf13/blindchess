import { useState, useSyncExternalStore } from 'react';
import { Accounts, accountError } from '../application/accounts';
import type { SyncedRepository } from '../application/synced-repository';
import { Modal } from './Modal';

export function AccountModal({ accounts, onClose }: { accounts: Accounts; onClose: () => void }) {
  const { user } = useSyncExternalStore(accounts.subscribe, accounts.getSnapshot);
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function submit() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (user) await accounts.chooseUsername(username);
      else if (mode === 'register') await accounts.register(email, password, username);
      else if (mode === 'login') await accounts.login(email, password);
      else {
        await accounts.resetPassword(email);
        setNotice('If this email has an account, a password reset link will arrive shortly.');
        return;
      }
      setPassword('');
      // A signup with an already-taken username stays signed in and can finish here.
      if (accounts.getSnapshot().user?.username) onClose();
    } catch (reason) {
      setError(accountError(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        user
          ? 'Your account'
          : mode === 'register'
            ? 'Create an account'
            : mode === 'reset'
              ? 'Reset your password'
              : 'Sign in'
      }
      onClose={onClose}
    >
      {user?.username ? (
        <>
          <p>
            Signed in as <strong>{user.username}</strong>.
          </p>
          <p className="muted">{user.email}</p>
          <p>Your game history and username are public. Your email and password are not.</p>
          <p className="tiny">
            Pending games stay on this device when you sign out. Sign back into this account here to
            finish uploading them. Guest games are never uploaded.
          </p>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          <button
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await accounts.logout();
                onClose();
              } catch (reason) {
                setError(accountError(reason));
              } finally {
                setBusy(false);
              }
            }}
          >
            Sign out
          </button>
        </>
      ) : (
        <form
          className="account-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {user ? (
            <p>Finish setting up your public username. Your account has already been created.</p>
          ) : (
            <p>
              Keep your game history across devices. Guest games stay in this tab and are not added
              to your account.
            </p>
          )}
          {!user && (
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {(user || mode === 'register') && (
            <label>
              Public username
              <input
                autoComplete="username"
                required
                minLength={3}
                maxLength={24}
                pattern="[a-zA-Z0-9_]+"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <small>3–24 letters, numbers, or underscores. Stored in lowercase.</small>
            </label>
          )}
          {!user && mode !== 'reset' && (
            <label>
              Password
              <input
                type="password"
                required
                minLength={mode === 'register' ? 8 : undefined}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {mode === 'register' && (
            <p className="tiny">
              Your username and account game history will be public. Your email stays private.
              Microphone audio stays on your device.
            </p>
          )}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          <button className="button primary" disabled={busy} type="submit">
            {busy
              ? 'Please wait…'
              : user
                ? 'Save username'
                : mode === 'register'
                  ? 'Create account'
                  : mode === 'reset'
                    ? 'Send reset link'
                    : 'Sign in'}
          </button>
          {!user && (
            <div className="account-links">
              {mode !== 'login' && (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setMode('login');
                    setError('');
                  }}
                >
                  Already have an account? Sign in
                </button>
              )}
              {mode !== 'register' && (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setMode('register');
                    setError('');
                  }}
                >
                  Create an account
                </button>
              )}
              {mode !== 'reset' && (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setMode('reset');
                    setError('');
                  }}
                >
                  Forgot password?
                </button>
              )}
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}

export function SyncNotice({ repository }: { repository: SyncedRepository }) {
  const status = useSyncExternalStore(repository.subscribe, repository.getSnapshot);
  const text =
    status.phase === 'synced'
      ? 'History synced. Account games are public.'
      : status.phase === 'offline'
        ? `Offline · ${status.pending ? `${status.pending} game(s) waiting to sync` : 'Cached account history available'}.`
        : status.phase === 'syncing'
          ? 'Saved on this device · uploading history…'
          : status.phase === 'connecting'
            ? 'Saved on this device · connecting to your account history…'
            : 'Saved on this device · cloud sync needs attention.';
  return (
    <div
      className={`notice sync-notice ${status.phase === 'error' ? 'error' : ''}`}
      aria-label="History sync"
    >
      <div>
        <span>{text}</span>
        {status.message && <p>{status.message}</p>}
      </div>
      {(status.phase === 'error' || status.phase === 'offline') && (
        <button className="text-button" onClick={repository.reconnect}>
          Retry sync
        </button>
      )}
    </div>
  );
}
