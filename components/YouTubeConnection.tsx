'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CheckCircle2, LoaderCircle, Unplug, X, SquarePlay } from 'lucide-react';
import {
  API_INTERFACES,
  readApiData,
  type YouTubeConnection as Connection,
} from '@/lib/api-contract';
import './youtube-connection.css';

const callbackMessages: Record<string, string> = {
  YOUTUBE_ACCESS_DENIED: 'Connection cancelled. You can try again whenever you’re ready.',
  YOUTUBE_STATE_INVALID: 'Your sign-in attempt expired. Please connect again.',
  YOUTUBE_SCOPE_MISSING: 'YouTube read access was not granted. Please try again.',
  YOUTUBE_CHANNEL_REQUIRED: 'Choose a Google account with a YouTube channel.',
  YOUTUBE_CHANNEL_UNAVAILABLE:
    'Could not read your channel. Enable YouTube Data API v3 in your Google project and try again.',
  YOUTUBE_OAUTH_NOT_CONFIGURED: 'Google sign-in is not configured yet.',
};

export default function YouTubeConnection({
  compact = false,
  outcome = '',
}: {
  compact?: boolean;
  outcome?: string;
}) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const connected = connection?.status === 'connected';
  const needsSetup = connection?.status === 'configuration_required';

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const data = await readApiData<Connection>(
        await fetch(API_INTERFACES.youtubeConnection.path, { cache: 'no-store' }),
      );
      setConnection(data);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check your YouTube connection.');
      setConnection(null);
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const sync = () => {
      void refresh();
    };
    window.addEventListener('focus', sync);
    window.addEventListener('youtube-connection-changed', sync);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('youtube-connection-changed', sync);
    };
  }, [refresh]);
  useEffect(() => {
    if (!connection?.expiresAt) return;
    const timer = setTimeout(
      () => void refresh(),
      Math.max(0, Date.parse(connection.expiresAt) - Date.now() + 100),
    );
    return () => clearTimeout(timer);
  }, [connection?.expiresAt, refresh]);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  async function connect() {
    setBusy(true);
    setError('');
    try {
      const data = await readApiData<{ authorizationUrl: string }>(
        await fetch(API_INTERFACES.connectYouTube.path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ acceptedPrivacy: accepted }),
        }),
      );
      window.location.assign(data.authorizationUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start Google sign-in.');
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    setError('');
    try {
      const data = await readApiData<{ revoked: boolean }>(
        await fetch(API_INTERFACES.disconnectYouTube.path, { method: 'DELETE' }),
      );
      setNotice(
        data.revoked
          ? 'Disconnected from YouTube.'
          : 'Local connection removed. Check Google account permissions to revoke any remaining access.',
      );
      window.dispatchEvent(new Event('youtube-connection-changed'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not disconnect YouTube.');
    } finally {
      setBusy(false);
    }
  }
  const actionLabel = checking
    ? 'Checking YouTube…'
    : connected
      ? 'YouTube connected'
      : 'Connect to YouTube';
  const resultMessage =
    outcome && outcome !== 'connected'
      ? callbackMessages[outcome] || 'Google sign-in could not be completed. Please connect again.'
      : outcome === 'connected' && connected
        ? `Connected to ${connection.channel?.title}.`
        : '';

  return (
    <>
      {compact ? (
        <button
          className={`youtube-connect-button youtube-connect-compact ${connected ? 'is-connected' : ''}`}
          onClick={() => {
            setOpen(true);
            setAccepted(false);
          }}
          aria-label={actionLabel}
          disabled={checking}
        >
          {checking ? (
            <LoaderCircle size={16} className="youtube-loading" />
          ) : connected ? (
            <CheckCircle2 size={16} />
          ) : (
            <SquarePlay size={18} />
          )}
          <span>{actionLabel}</span>
        </button>
      ) : (
        <section className="youtube-connection-card" aria-label="YouTube connection">
          <div className="youtube-connection-heading">
            <div className="youtube-brand">
              <SquarePlay size={27} />
              <div>
                <h2>YouTube</h2>
                <span>
                  {connected ? connection.channel?.title : 'Bring your interests to YouTube.'}
                </span>
              </div>
            </div>
            <span className={`youtube-connection-status ${connected ? 'is-connected' : ''}`}>
              {checking
                ? 'Checking…'
                : error
                  ? 'Could not verify'
                  : connected
                    ? 'Connected · read access'
                    : needsSetup
                      ? 'Setup needed'
                      : connection?.status === 'expired'
                        ? 'Session expired'
                        : 'Not connected'}
            </span>
          </div>
          <p>
            {connected
              ? 'Your channel is connected. Video search and confirmed likes are coming next.'
              : 'Connect your account first. You’ll choose which videos to like when feedback is available.'}
          </p>
          <div className="youtube-connection-actions">
            <button
              className="youtube-connect-button"
              onClick={() => {
                setOpen(true);
                setAccepted(false);
              }}
              disabled={checking}
            >
              {connected ? <CheckCircle2 size={17} /> : <SquarePlay size={18} />}
              {connected ? 'Manage connection' : 'Connect to YouTube'}
            </button>
            <a href="/instructions#youtube-privacy">Connection & privacy</a>
          </div>
          {(resultMessage || notice) && (
            <p className="youtube-feedback" role="status">
              {notice || resultMessage}
            </p>
          )}
          {error && (
            <p className="youtube-feedback" role="alert">
              {error} <button onClick={() => void refresh()}>Try again</button>
            </p>
          )}
        </section>
      )}
      {open && (
        <dialog
          ref={dialog}
          className="youtube-connection-dialog"
          aria-labelledby={compact ? 'youtube-dialog-compact' : 'youtube-dialog-card'}
          onCancel={() => setOpen(false)}
          onClick={(event) => {
            if (event.target === dialog.current && !busy) setOpen(false);
          }}
        >
          <div className="youtube-dialog-heading">
            <SquarePlay size={30} />
            <button
              aria-label="Close YouTube connection"
              className="icon-button"
              onClick={() => setOpen(false)}
            >
              <X size={21} />
            </button>
          </div>
          <h2 id={compact ? 'youtube-dialog-compact' : 'youtube-dialog-card'}>
            {connected
              ? 'Your YouTube connection'
              : needsSetup
                ? 'One setup, then you’re in.'
                : 'Connect your YouTube'}
          </h2>
          {connected ? (
            <>
              <p>
                <strong>{connection.channel?.title}</strong>
              </p>
              <p>Read access only. This connection does not like, dislike, or play videos.</p>
              <p className="youtube-dialog-small">
                This session lasts up to one hour. You may need to reconnect after a server restart.
              </p>
              <button
                className="youtube-connect-button youtube-disconnect"
                disabled={busy}
                onClick={() => void disconnect()}
              >
                <Unplug size={17} />
                {busy ? 'Disconnecting…' : 'Disconnect YouTube'}
              </button>
            </>
          ) : needsSetup ? (
            <>
              <p>
                The app needs a Google OAuth client before Google can ask you to connect. Your Jev
                key is separate.
              </p>
              <details className="youtube-setup-details" open>
                <summary>Set up Google sign-in</summary>
                <ol>
                  <li>Enable YouTube Data API v3 in your Google Cloud project.</li>
                  <li>Set up the consent screen and add your Google account as a test user.</li>
                  <li>
                    Create an OAuth client with type <strong>Web application</strong>.
                  </li>
                  <li>
                    Register this exact redirect URI:
                    <code>
                      {connection.redirectUri ||
                        'Set GOOGLE_OAUTH_REDIRECT_URI to this app’s callback URL.'}
                    </code>
                  </li>
                  <li>
                    Add the client credentials to this app’s private <code>.env.local</code> and
                    restart the app.
                    <code>
                      GOOGLE_CLIENT_ID
                      <br />
                      GOOGLE_CLIENT_SECRET
                      <br />
                      GOOGLE_OAUTH_REDIRECT_URI
                    </code>
                  </li>
                </ol>
              </details>
              <div className="youtube-connection-actions">
                <a
                  className="youtube-connect-button"
                  href="https://console.cloud.google.com/auth/clients"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Google Cloud <ArrowUpRight size={16} />
                </a>
                <button
                  className="secondary-button"
                  onClick={() => void refresh()}
                  disabled={checking}
                >
                  {checking ? 'Checking…' : 'Check setup again'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                Google will ask you to choose an account and allow read access to your YouTube
                account. We use it to identify your channel.
              </p>
              <p className="youtube-dialog-small">
                No likes, dislikes, or playback. Your connection stays in server memory for up to
                one hour and is never sent to Jev.
              </p>
              <label className="youtube-consent">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(event) => setAccepted(event.target.checked)}
                />
                <span>
                  I agree to the{' '}
                  <a href="/instructions#youtube-privacy" target="_blank" rel="noreferrer">
                    connection privacy notice
                  </a>{' '}
                  and{' '}
                  <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">
                    YouTube Terms
                  </a>
                  .
                </span>
              </label>
              <button
                className="youtube-connect-button"
                disabled={!accepted || busy || !connection || checking}
                onClick={() => void connect()}
              >
                {busy ? (
                  <LoaderCircle size={17} className="youtube-loading" />
                ) : (
                  <SquarePlay size={18} />
                )}
                {busy ? 'Opening Google…' : 'Continue with Google'}
              </button>
            </>
          )}
          {error && (
            <p className="youtube-feedback" role="alert">
              {error} <button onClick={() => void refresh()}>Try again</button>
            </p>
          )}
          {notice && (
            <p className="youtube-feedback" role="status">
              {notice}
            </p>
          )}
          <a
            className="youtube-manage-link"
            href="https://myaccount.google.com/connections"
            target="_blank"
            rel="noreferrer"
          >
            Manage access in your Google account <ArrowUpRight size={13} />
          </a>
        </dialog>
      )}
    </>
  );
}
