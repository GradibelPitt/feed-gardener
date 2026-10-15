'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Account } from '@/lib/accounts';
import {
  flushAccountStorage,
  initializeAccountStorage,
  retryAccountStorage,
  storageStatus,
  subscribeStorage,
} from '@/lib/account-storage';
const Context = createContext<{
  account: Account | null;
  changed: (account: Account | null) => Promise<void>;
}>({ account: null, changed: async () => {} });
export const useAccount = () => useContext(Context);
export default function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [sync, setSync] = useState(storageStatus);
  useEffect(() => subscribeStorage(() => setSync(storageStatus())), []);
  useEffect(() => {
    let active = true;
    const originalFetch = window.fetch.bind(window);
    let activeId: string | null = null;
    window.fetch = (input, init) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        window.location.href,
      );
      if (activeId && url.origin === location.origin && url.pathname.startsWith('/api/')) {
        const headers = new Headers(
          init?.headers || (input instanceof Request ? input.headers : undefined),
        );
        if (!headers.has('X-Feeder-Account')) headers.set('X-Feeder-Account', activeId);
        return originalFetch(input, { ...init, headers });
      }
      return originalFetch(input, init);
    };
    void (async () => {
      try {
        const response = await originalFetch('/api/account', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        activeId = data.account?.id || null;
        await initializeAccountStorage(activeId);
        if (active) {
          setAccount(data.account);
          setReady(true);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Could not load your account.');
      }
    })();
    const channel =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('feeder-account') : null;
    const reload = () => {
      setReady(false);
      location.reload();
    };
    if (channel) channel.onmessage = reload;
    const checkAccount = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await originalFetch('/api/account', { cache: 'no-store' });
        if (response.ok && ((await response.json()).account?.id || null) !== activeId) reload();
      } catch {
        /* Keep unsaved work visible during a network interruption. */
      }
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (['saving', 'error'].includes(storageStatus().status)) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', checkAccount);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      active = false;
      channel?.close();
      window.fetch = originalFetch;
      document.removeEventListener('visibilitychange', checkAccount);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);
  async function changed(next: Account | null) {
    if (next?.id === account?.id) {
      setAccount(next);
      return;
    }
    setReady(false);
    const channel =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('feeder-account') : null;
    channel?.postMessage('changed');
    channel?.close();
    location.reload();
  }
  if (error)
    return (
      <main className="account-boot" role="alert">
        <h1>Your account could not be loaded</h1>
        <p>{error}</p>
        <button onClick={() => location.reload()}>Try again</button>
      </main>
    );
  if (!ready)
    return (
      <main className="account-boot" aria-busy="true">
        Loading your workspace…
      </main>
    );
  return (
    <Context.Provider value={{ account, changed }}>
      {account && (
        <div className="account-sync" role="status">
          {sync.status === 'saving' ? (
            'Saving to your account…'
          ) : sync.status === 'error' ? (
            <>
              {sync.message}{' '}
              <button
                onClick={() => {
                  void retryAccountStorage().catch(() => {});
                }}
              >
                Retry
              </button>{' '}
              <button onClick={() => location.reload()}>Reload cloud data</button>
            </>
          ) : (
            'Saved to your account'
          )}
        </div>
      )}
      {children}
    </Context.Provider>
  );
}
