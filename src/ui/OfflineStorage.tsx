import { useEffect, useState } from 'react';

export function OfflineStorage() {
  const [protectedStorage, setProtectedStorage] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    void navigator.storage
      ?.persisted?.()
      .then(setProtectedStorage)
      .catch(() => {});
  }, []);
  return (
    <div className="offline-storage">
      <button
        className="button secondary small"
        disabled={protectedStorage || !navigator.storage?.persist}
        onClick={async () => {
          try {
            const granted = await navigator.storage.persist();
            setProtectedStorage(granted);
            setMessage(
              granted
                ? 'The browser granted persistent storage. Clearing site data still removes downloads and unsynced games.'
                : 'This browser did not grant persistent storage. Your downloads still work offline; check readiness before a trip.',
            );
          } catch {
            setMessage('Storage protection is unavailable in this browser.');
          }
        }}
      >
        {protectedStorage ? 'Offline storage protected' : 'Protect offline downloads'}
      </button>
      {message && (
        <p className="tiny" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
