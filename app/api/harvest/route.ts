import { withAccountContext } from '@/lib/account-context';
import { apiError, apiSuccess } from '@/lib/api-contract';
import { harvestPublicSources } from '@/lib/crawler/harvest';
import { LIVE_SOURCES, type LiveSource } from '@/lib/crawler/types';
import { clearApiConfiguration, saveApiConfiguration } from '@/lib/api-settings';

export const runtime = 'nodejs';

async function handleGET(request: Request) {
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
    (cursor.length > (requestedSource === 'YouTube' ? 24_000 : 2048) ||
      !['YouTube', 'Bilibili'].includes(requestedSource ?? ''))
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

async function handlePUT(request: Request) {
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
  try {
    const id = input.source === 'Google Scholar' ? 'scholar' : 'youtube';
    if (input.apiKey.trim())
      saveApiConfiguration({ id, name: input.source, values: { apiKey: input.apiKey.trim() } });
    else clearApiConfiguration(id);
  } catch {
    return apiError(500, 'SETTINGS_SAVE_FAILED', 'Could not save API settings.');
  }
  return apiSuccess(
    { configured: input.apiKey.trim() !== '' },
    { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } },
  );
}

export async function GET(request: Request) { return withAccountContext(handleGET, false)(request); }

export async function PUT(request: Request) { return withAccountContext(handlePUT, true)(request); }
