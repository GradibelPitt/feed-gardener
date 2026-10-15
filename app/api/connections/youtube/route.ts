import { withAccountContext } from '@/lib/account-context';
import 'server-only';
import { cookies } from 'next/headers';
import { apiError, apiSuccess } from '@/lib/api-contract';
import {
  assertYouTubeOrigin,
  youtubeConnectionService,
  YouTubeConnectionError,
  YOUTUBE_SESSION_COOKIE,
  YOUTUBE_STATE_COOKIE,
} from '@/lib/youtube-connection';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
function failure(error: unknown) {
  const known = error instanceof YouTubeConnectionError;
  const response = apiError(
    known ? error.status : 500,
    known ? error.code : 'YOUTUBE_CONNECTION_ERROR',
    known ? error.message : 'YouTube connection could not be updated.',
  );
  Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}
async function handleGET() {
  try {
    const jar = await cookies();
    const data = await youtubeConnectionService().status(jar.get(YOUTUBE_SESSION_COOKIE)?.value);
    return apiSuccess(data, { headers });
  } catch (error) {
    return failure(error);
  }
}
async function handlePOST(request: Request) {
  try {
    assertYouTubeOrigin(request);
    const body = await request.json().catch(() => null);
    if (!body || body.acceptedPrivacy !== true) {
      throw new YouTubeConnectionError(
        'YOUTUBE_CONSENT_REQUIRED',
        'Please accept the connection privacy notice.',
        422,
      );
    }
    const jar = await cookies();
    const result = youtubeConnectionService().start(jar.get(YOUTUBE_STATE_COOKIE)?.value);
    jar.set(YOUTUBE_STATE_COOKIE, result.state, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: new URL(request.url).protocol === 'https:',
      maxAge: result.maxAge,
    });
    return apiSuccess({ authorizationUrl: result.authorizationUrl }, { headers });
  } catch (error) {
    return failure(error);
  }
}
async function handleDELETE(request: Request) {
  try {
    assertYouTubeOrigin(request);
    const jar = await cookies();
    const result = await youtubeConnectionService().disconnect(
      jar.get(YOUTUBE_SESSION_COOKIE)?.value,
      jar.get(YOUTUBE_STATE_COOKIE)?.value,
    );
    jar.delete(YOUTUBE_SESSION_COOKIE);
    jar.delete(YOUTUBE_STATE_COOKIE);
    return apiSuccess(result, { headers });
  } catch (error) {
    return failure(error);
  }
}

export async function GET(request: Request) { return withAccountContext(handleGET, false)(request); }

export async function POST(request: Request) { return withAccountContext(handlePOST, true)(request); }

export async function DELETE(request: Request) { return withAccountContext(handleDELETE, true)(request); }
