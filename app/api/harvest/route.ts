import { apiError, apiSuccess } from '@/lib/api-contract';
import { harvestPublicSources } from '@/lib/crawler/harvest';
import { LIVE_SOURCES, type LiveSource } from '@/lib/crawler/types';
import { setYouTubeSearchApiKey } from '@/lib/crawler/youtube';
import { setScholarApiKey } from '@/lib/crawler/google-scholar';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get('refresh') === 'true';
  const tags = url.searchParams
    .getAll('tag')
    .filter((tag) => tag.length <= 80)
    .slice(0, 2);
  const localizedTags = url.searchParams
    .getAll('tagZh')
    .filter((tag) => tag.length <= 80)
    .slice(0, 2);
  const requestedSource = url.searchParams.get('source');
  if (requestedSource !== null && !LIVE_SOURCES.includes(requestedSource as LiveSource)) {
    return apiError(400, 'INVALID_SOURCE', 'Unknown public source.');
  }
  const cursor = url.searchParams.get('cursor');
  if (
    cursor !== null &&
    (cursor.length > 2048 || !['YouTube', 'Bilibili'].includes(requestedSource ?? ''))
  )
    return apiError(400, 'INVALID_CURSOR', 'Video cursor requires a video source.');
  const payload = await harvestPublicSources(
    forceRefresh,
    tags,
    requestedSource === null ? undefined : (requestedSource as LiveSource),
    localizedTags,
    cursor ?? undefined,
  );
  return apiSuccess(payload, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

export async function PUT(request: Request) {
  const url = new URL(request.url);
  const requestOrigin = `${url.protocol}//${request.headers.get('host') ?? url.host}`;
  let localHost = false;
  try {
    localHost = ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(requestOrigin).hostname);
  } catch {
    return apiError(403, 'ORIGIN_MISMATCH', 'Open this action from the local Feed Gardener app.');
  }
  if (!localHost || request.headers.get('origin') !== requestOrigin) {
    return apiError(403, 'ORIGIN_MISMATCH', 'Open this action from the local Feed Gardener app.');
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return apiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Expected a JSON request.');
  }
  const declaredLength = Number(request.headers.get('content-length'));
  if (declaredLength > 512) return apiError(413, 'REQUEST_TOO_LARGE', 'Request is too large.');
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 512) return apiError(413, 'REQUEST_TOO_LARGE', 'Request is too large.');
    body = JSON.parse(raw);
  } catch {
    return apiError(400, 'INVALID_JSON', 'Expected a JSON request.');
  }
  const input = body as { source?: unknown; apiKey?: unknown } | null;
  if (
    !input ||
    (input.source !== 'YouTube' && input.source !== 'Google Scholar') ||
    typeof input.apiKey !== 'string' ||
    (input.apiKey.trim() !== '' && !/^[A-Za-z0-9_-]{20,256}$/.test(input.apiKey.trim()))
  ) {
    return input?.source === 'Google Scholar'
      ? apiError(422, 'INVALID_SCHOLAR_KEY', 'Enter a valid SerpApi key.')
      : apiError(422, 'INVALID_YOUTUBE_KEY', 'Enter a valid YouTube Data API key.');
  }
  if (input.source === 'Google Scholar') setScholarApiKey(input.apiKey.trim());
  else setYouTubeSearchApiKey(input.apiKey.trim());
  return apiSuccess(
    { configured: input.apiKey.trim() !== '' },
    { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } },
  );
}
