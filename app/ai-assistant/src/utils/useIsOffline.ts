import { useEffect, useState } from 'react';

// True only when the platform actively reports no network; an absent signal counts as online, so a
// webview that never sets it can't lock the chat out.
export const isOffline = (): boolean =>
  typeof navigator !== 'undefined' && navigator.onLine === false;

// The machine's connectivity, live. The agent talks to a remote provider, so offline every turn is
// doomed — and it fails silently (the agent CLI just retries), hence the panel says so itself.
export const useIsOffline = (): boolean => {
  const [offline, setOffline] = useState(isOffline);

  useEffect(() => {
    const sync = (): void => setOffline(isOffline());
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    sync(); // the connection may have dropped between the first render and this subscription

    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return offline;
};
