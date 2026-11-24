'use client';

import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import Landing from './Landing';

/** Set once a visitor has chosen to open the workspace on this browser. */
export const ENTERED_STORAGE = 'feeder:entered:v1';
const GUEST_WORKSPACE_STORAGE = 'feed-gardener-demo-v1';
const WORKSPACE_HASH = /^#(discover|shorts|settings|library|saved|api|account|garden)$/;
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function hasEntered(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has('landing')) return false;
    if (WORKSPACE_HASH.test(window.location.hash)) return true;
    return (
      localStorage.getItem(ENTERED_STORAGE) === '1' ||
      localStorage.getItem(GUEST_WORKSPACE_STORAGE) !== null
    );
  } catch {
    return false;
  }
}

/**
 * Shows the landing page to first-time visitors and the workspace to everyone else.
 * The server renders the landing page; `app/layout.tsx` hides it before paint for
 * returning visitors so they never see it flash.
 */
export default function HomeGate({ children }: { children: ReactNode }) {
  const [entered, setEntered] = useState(false);

  useIsomorphicLayoutEffect(() => {
    if (hasEntered()) setEntered(true);
  }, []);

  useEffect(() => {
    if (entered || new URLSearchParams(window.location.search).has('landing')) return;
    let active = true;
    // A signed-in visitor on a fresh browser profile goes straight to their workspace.
    fetch('/api/account', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && data?.account) setEntered(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [entered]);

  if (entered) return <>{children}</>;

  return (
    <Landing
      onEnter={(page) => {
        try {
          localStorage.setItem(ENTERED_STORAGE, '1');
        } catch {
          // Private browsing: the workspace still opens for this visit.
        }
        const url = new URL(window.location.href);
        url.searchParams.delete('landing');
        url.hash = page;
        window.history.replaceState(window.history.state, '', url);
        document.documentElement.dataset.feederEntered = '';
        window.scrollTo({ top: 0, behavior: 'instant' });
        setEntered(true);
      }}
    />
  );
}
