import { withAccountContext } from '@/lib/account-context';
import 'server-only';
import { cookies } from 'next/headers';
import { apiSuccess } from '@/lib/api-contract';
import {
  youtubeConfig,
  youtubeRequestOrigin,
  youtubeConnectionService,
  YouTubeConnectionError,
  YOUTUBE_SESSION_COOKIE,
  YOUTUBE_STATE_COOKIE,
} from '@/lib/youtube-connection';

export const runtime = 'nodejs';
async function handleGET(request: Request) {
  const jar = await cookies();
  let outcome = 'connected';
  try {
    const config = youtubeConfig();
    if (
      !config.missing.length &&
      youtubeRequestOrigin(request) !== new URL(config.redirectUri).origin
    ) {
      throw new YouTubeConnectionError(
        'YOUTUBE_STATE_INVALID',
        'Reconnect from the configured address.',
        403,
      );
    }
    const result = await youtubeConnectionService().complete(
      new URL(request.url).searchParams,
      jar.get(YOUTUBE_STATE_COOKIE)?.value,
      jar.get(YOUTUBE_SESSION_COOKIE)?.value,
    );
    jar.set(YOUTUBE_SESSION_COOKIE, result.sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: new URL(request.url).protocol === 'https:',
      maxAge: result.maxAge,
    });
  } catch (error) {
    outcome = error instanceof YouTubeConnectionError ? error.code : 'YOUTUBE_CONNECTION_ERROR';
  }
  jar.delete(YOUTUBE_STATE_COOKIE);
  const location = `/?youtube=${encodeURIComponent(outcome)}`;
  return apiSuccess(
    { redirectTo: location },
    {
      status: 303,
      headers: {
        Location: location,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    },
  );
}

export async function GET(request: Request) { return withAccountContext(handleGET, true)(request); }
