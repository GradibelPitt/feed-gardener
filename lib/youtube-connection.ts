import { apiContext } from './account-context.ts';
import { runtimeEnv } from './runtime-env.ts';
// Server-only domain logic: node:crypto prevents use in the browser bundle.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { API_INTERFACES, type YouTubeConnection } from './api-contract.ts';

const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const STATE_TTL = 10 * 60 * 1000;
const MAX_SESSIONS = 200;
export const YOUTUBE_SESSION_COOKIE = 'fg_youtube_session';
export const YOUTUBE_STATE_COOKIE = 'fg_youtube_state';

export class YouTubeConnectionError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type Pending = { state: string; verifier: string; expires: number };
type Session = { token: string; expires: number; channel: { id: string; title: string } };
type Store = { pending: Map<string, Pending>; sessions: Map<string, Session> };
type Config = { clientId: string; clientSecret: string; redirectUri: string; missing: string[] };
export const newYouTubeStore = (): Store => ({ pending: new Map(), sessions: new Map() });

export function youtubeConfig(env: Record<string, string | undefined> = runtimeEnv()): Config {
  const clientId = env.GOOGLE_CLIENT_ID?.trim() || '';
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim() || '';
  const redirectUri =
    env.GOOGLE_OAUTH_REDIRECT_URI?.trim() ||
    `http://127.0.0.1:3000${API_INTERFACES.youtubeCallback.path}`;
  const missing = [
    ...(!clientId ? ['GOOGLE_CLIENT_ID'] : []),
    ...(!clientSecret ? ['GOOGLE_CLIENT_SECRET'] : []),
  ];
  try {
    const uri = new URL(redirectUri);
    if (
      (uri.protocol !== 'https:' &&
        !(
          uri.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(uri.hostname)
        )) ||
      uri.pathname !== API_INTERFACES.youtubeCallback.path ||
      uri.search ||
      uri.hash ||
      uri.username ||
      uri.password
    )
      throw new Error('Invalid redirect');
  } catch {
    missing.push('GOOGLE_OAUTH_REDIRECT_URI');
  }
  return { clientId, clientSecret, redirectUri, missing };
}

export function youtubeRequestOrigin(request: Request) {
  const url = new URL(request.url);
  return request.headers.has('host')
    ? `${url.protocol}//${request.headers.get('host')}`
    : url.origin;
}

export function assertYouTubeOrigin(request: Request, config = youtubeConfig()) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== youtubeRequestOrigin(request)) {
    throw new YouTubeConnectionError(
      'ORIGIN_MISMATCH',
      'Open this action from Feed Gardener.',
      403,
    );
  }
  if (!config.missing.length && origin !== new URL(config.redirectUri).origin) {
    throw new YouTubeConnectionError(
      'REDIRECT_ORIGIN_MISMATCH',
      'Open Feed Gardener at the address registered for Google sign-in.',
      409,
    );
  }
}

export function createYouTubeConnectionService(
  store: Store,
  config: Config,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
) {
  function sweep() {
    for (const [id, entry] of store.pending) if (entry.expires <= now()) store.pending.delete(id);
    for (const [id, entry] of store.sessions) if (entry.expires <= now()) store.sessions.delete(id);
  }
  function requireConfig() {
    if (config.missing.length)
      throw new YouTubeConnectionError(
        'YOUTUBE_OAUTH_NOT_CONFIGURED',
        'Google sign-in needs a client ID and client secret configured on this server.',
        503,
      );
  }
  function base(status: YouTubeConnection['status']): YouTubeConnection {
    return {
      status,
      permission: 'youtube.readonly',
      missingConfiguration: config.missing,
      redirectUri: config.missing.includes('GOOGLE_OAUTH_REDIRECT_URI') ? '' : config.redirectUri,
    };
  }
  async function request(url: string, init: RequestInit) {
    try {
      return await fetcher(url, {
        ...init,
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new YouTubeConnectionError(
        'YOUTUBE_CONNECTION_UNAVAILABLE',
        'Google could not be reached. Please try again.',
        502,
      );
    }
  }
  async function json(response: Response): Promise<Record<string, unknown>> {
    try {
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
      return result as Record<string, unknown>;
    } catch {
      throw new YouTubeConnectionError(
        'YOUTUBE_INVALID_RESPONSE',
        'Google returned an incomplete response.',
        502,
      );
    }
  }
  async function revoke(token: string) {
    try {
      const response = await request('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  async function channel(token: string) {
    const response = await request(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (response.status === 401)
      throw new YouTubeConnectionError('YOUTUBE_AUTH_EXPIRED', 'Please reconnect YouTube.', 401);
    if (!response.ok)
      throw new YouTubeConnectionError(
        'YOUTUBE_CHANNEL_UNAVAILABLE',
        'Could not verify your YouTube channel. Check that YouTube Data API v3 is enabled, then try again.',
        502,
      );
    const body = await json(response);
    const items = body.items as { id?: unknown; snippet?: { title?: unknown } }[] | undefined;
    if (
      !Array.isArray(items) ||
      items.length !== 1 ||
      typeof items[0]?.id !== 'string' ||
      typeof items[0]?.snippet?.title !== 'string'
    ) {
      throw new YouTubeConnectionError(
        'YOUTUBE_CHANNEL_REQUIRED',
        'A single YouTube channel could not be identified. Choose an account with a YouTube channel.',
        422,
      );
    }
    return { id: items[0].id, title: items[0].snippet.title };
  }
  return {
    start(previousState?: string) {
      requireConfig();
      sweep();
      if (previousState) store.pending.delete(previousState);
      if (store.pending.size >= MAX_SESSIONS || store.sessions.size >= MAX_SESSIONS) {
        throw new YouTubeConnectionError(
          'YOUTUBE_CONNECTION_BUSY',
          'Too many connection attempts. Try later.',
          429,
        );
      }
      const state = randomBytes(32).toString('base64url');
      const verifier = randomBytes(32).toString('base64url');
      store.pending.set(state, { state, verifier, expires: now() + STATE_TTL });
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: SCOPE,
        state,
        access_type: 'online',
        prompt: 'consent select_account',
        include_granted_scopes: 'false',
        code_challenge_method: 'S256',
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      }).toString();
      return { authorizationUrl: url.toString(), state, maxAge: STATE_TTL / 1000 };
    },
    async complete(params: URLSearchParams, browserState?: string, oldSession?: string) {
      requireConfig();
      sweep();
      const state = params.get('state');
      const entry = browserState ? store.pending.get(browserState) : undefined;
      if (
        !entry ||
        !state ||
        !/^[A-Za-z0-9_-]{43}$/.test(state) ||
        state.length !== entry.state.length ||
        !timingSafeEqual(Buffer.from(state), Buffer.from(entry.state))
      ) {
        throw new YouTubeConnectionError(
          'YOUTUBE_STATE_INVALID',
          'This sign-in attempt expired. Please reconnect.',
          403,
        );
      }
      store.pending.delete(browserState!);
      if (params.has('error'))
        throw new YouTubeConnectionError(
          'YOUTUBE_ACCESS_DENIED',
          'YouTube connection was cancelled.',
          403,
        );
      const code = params.get('code');
      if (!code || code.length > 4096)
        throw new YouTubeConnectionError(
          'YOUTUBE_CODE_MISSING',
          'Google did not return a sign-in code.',
        );
      const response = await request('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          grant_type: 'authorization_code',
          code_verifier: entry.verifier,
        }),
      });
      if (!response.ok)
        throw new YouTubeConnectionError(
          'YOUTUBE_TOKEN_EXCHANGE_FAILED',
          'Google sign-in could not be completed. Please reconnect.',
          502,
        );
      const token = await json(response);
      if (
        typeof token.access_token !== 'string' ||
        !token.access_token ||
        token.token_type !== 'Bearer'
      ) {
        throw new YouTubeConnectionError(
          'YOUTUBE_INVALID_RESPONSE',
          'Google returned an incomplete response.',
          502,
        );
      }
      try {
        if (typeof token.scope !== 'string' || !token.scope.split(' ').includes(SCOPE)) {
          throw new YouTubeConnectionError(
            'YOUTUBE_SCOPE_MISSING',
            'YouTube read access was not granted.',
            403,
          );
        }
        if (
          typeof token.expires_in !== 'number' ||
          !Number.isFinite(token.expires_in) ||
          token.expires_in <= 0
        ) {
          throw new YouTubeConnectionError(
            'YOUTUBE_INVALID_RESPONSE',
            'Google returned an incomplete response.',
            502,
          );
        }
        const identity = await channel(token.access_token);
        const id = randomBytes(32).toString('base64url');
        const expires = now() + Math.min(token.expires_in, 3600) * 1000;
        store.sessions.set(id, { token: token.access_token, expires, channel: identity });
        if (oldSession) store.sessions.delete(oldSession);
        return { sessionId: id, maxAge: Math.floor((expires - now()) / 1000) };
      } catch (error) {
        await revoke(token.access_token);
        throw error;
      }
    },
    async status(sessionId?: string): Promise<YouTubeConnection> {
      sweep();
      if (config.missing.length) return base('configuration_required');
      const session = sessionId ? store.sessions.get(sessionId) : undefined;
      if (!session) return base(sessionId ? 'expired' : 'disconnected');
      try {
        const identity = await channel(session.token);
        if (identity.id !== session.channel.id) {
          store.sessions.delete(sessionId!);
          return base('expired');
        }
        return {
          ...base('connected'),
          channel: identity,
          expiresAt: new Date(session.expires).toISOString(),
        };
      } catch (error) {
        if (error instanceof YouTubeConnectionError && error.status === 401) {
          store.sessions.delete(sessionId!);
          return base('expired');
        }
        throw error;
      }
    },
    async disconnect(sessionId?: string, pendingState?: string) {
      if (pendingState) store.pending.delete(pendingState);
      const session = sessionId ? store.sessions.get(sessionId) : undefined;
      if (sessionId) store.sessions.delete(sessionId);
      return {
        disconnected: true,
        revoked: session ? await revoke(session.token) : false,
        managePermissionsUrl: 'https://myaccount.google.com/connections',
      };
    },
  };
}

export function youtubeConnectionService() {
  const context = apiContext.getStore();
  const raw = context?.store['internal:youtube-oauth']?.values;
  const store: Store = raw
    ? {
        pending: new Map(JSON.parse(raw.pending || '[]')),
        sessions: new Map(JSON.parse(raw.sessions || '[]')),
      }
    : newYouTubeStore();
  const service = createYouTubeConnectionService(store, youtubeConfig());
  const persist = () => {
    if (!context?.account) return;
    context.store['internal:youtube-oauth'] = {
      name: 'YouTube connection',
      values: {
        pending: JSON.stringify([...store.pending]),
        sessions: JSON.stringify([...store.sessions]),
      },
    };
    context.dirty = true;
  };
  return {
    start(...args: Parameters<typeof service.start>) {
      try {
        return service.start(...args);
      } finally {
        persist();
      }
    },
    async complete(...args: Parameters<typeof service.complete>) {
      try {
        return await service.complete(...args);
      } finally {
        persist();
      }
    },
    async status(...args: Parameters<typeof service.status>) {
      try {
        return await service.status(...args);
      } finally {
        persist();
      }
    },
    async disconnect(...args: Parameters<typeof service.disconnect>) {
      try {
        return await service.disconnect(...args);
      } finally {
        persist();
      }
    },
  };
}
