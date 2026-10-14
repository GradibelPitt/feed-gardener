import { classifyDomain, cleanText, fetchWithTimeout, keywordTags } from './core.ts';
import type { HarvestItem } from './types.ts';
import { videoSearchTerms } from './video-search-terms.ts';
import { fetchPublicYouTubeSearchPage } from './youtube-public.ts';

type SearchEntry = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
  };
};

type YouTubeSearchRuntime = { apiKey: string | null; revision: number };
const runtime = globalThis as typeof globalThis & {
  __feederYouTubeSearch?: YouTubeSearchRuntime;
};

function searchRuntime(): YouTubeSearchRuntime {
  return (runtime.__feederYouTubeSearch ??= { apiKey: null, revision: 0 });
}

function youtubeSearchApiKey(): string {
  return (
    searchRuntime().apiKey ??
    (process.env.YOUTUBE_SEARCH_PROVIDER === 'official'
      ? (process.env.YOUTUBE_API_KEY?.trim() ?? '')
      : '')
  );
}

async function fetchYouTubeEndpoint(url: URL, apiKey: string): Promise<Response> {
  try {
    return await fetchWithTimeout(
      url.toString(),
      { headers: { 'x-goog-api-key': apiKey } },
      12_000,
    );
  } catch {
    // Never pass a transport error with request details into health warnings.
    throw new Error('YouTube request could not be completed');
  }
}

export function setYouTubeSearchApiKey(apiKey: string | null): void {
  const state = searchRuntime();
  state.apiKey = apiKey;
  state.revision += 1;
}

export function youtubeSearchKeyRevision(): number {
  return searchRuntime().revision;
}

export function youtubeSearchConfigured(): boolean {
  return true;
}

export function youtubeEmbedUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const id = ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)
      ? url.searchParams.get('v')
      : url.hostname === 'youtu.be' || url.hostname === 'www.youtu.be'
        ? url.pathname.slice(1)
        : null;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id)
      ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=0`
      : null;
  } catch {
    return null;
  }
}

type SearchCursor = { nextIndex: number; tokens: Array<string | false | null> };

function readCursor(value: string | undefined, termCount: number): SearchCursor {
  if (!value) return { nextIndex: 0, tokens: Array(termCount).fill(null) };
  try {
    if (value.length > 2048) throw new Error('Invalid cursor');
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString()) as SearchCursor;
    if (
      !Number.isInteger(parsed.nextIndex) ||
      parsed.nextIndex < 0 ||
      parsed.nextIndex >= termCount ||
      !Array.isArray(parsed.tokens) ||
      parsed.tokens.length !== termCount ||
      parsed.tokens.some(
        (token) =>
          token !== null &&
          token !== false &&
          (typeof token !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(token)),
      )
    )
      throw new Error('Invalid cursor');
    return parsed;
  } catch {
    throw new Error('Invalid YouTube search cursor');
  }
}

export async function fetchYouTubeSearchPage(
  tags: string[],
  localizedTags: string[] = [],
  cursor?: string,
): Promise<{ items: HarvestItem[]; nextCursor: string | null }> {
  const apiKey = youtubeSearchApiKey();
  if (!apiKey) return fetchPublicYouTubeSearchPage(tags, localizedTags, cursor);
  const terms = videoSearchTerms(tags, localizedTags);
  if (!terms.length) return { items: [], nextCursor: null };
  const state = readCursor(cursor, terms.length);
  const index = state.nextIndex;
  if (state.tokens[index] === false) throw new Error('Invalid YouTube search cursor');
  const endpoint = new URL('https://www.googleapis.com/youtube/v3/search');
  endpoint.searchParams.set('part', 'snippet');
  endpoint.searchParams.set('type', 'video');
  endpoint.searchParams.set('videoEmbeddable', 'true');
  endpoint.searchParams.set('maxResults', '30');
  endpoint.searchParams.set('q', terms[index]);
  if (state.tokens[index]) endpoint.searchParams.set('pageToken', state.tokens[index]);
  const response = await fetchYouTubeEndpoint(endpoint, apiKey);
  if (!response.ok) throw new Error(`YouTube search returned HTTP ${response.status}`);
  const payload = (await response.json()) as { items?: SearchEntry[]; nextPageToken?: string };
  if (!Array.isArray(payload.items)) throw new Error('YouTube search returned invalid data');
  const tokens = [...state.tokens];
  tokens[index] =
    payload.nextPageToken && /^[A-Za-z0-9_-]{1,256}$/.test(payload.nextPageToken)
      ? payload.nextPageToken
      : false;
  const nextIndex = Array.from(
    { length: terms.length },
    (_, offset) => (index + offset + 1) % terms.length,
  ).find((candidate) => tokens[candidate] !== false);
  const nextCursor =
    nextIndex === undefined
      ? null
      : Buffer.from(JSON.stringify({ nextIndex, tokens })).toString('base64url');
  const videoIds = payload.items
    .map((entry) => entry.id?.videoId)
    .filter((id): id is string => Boolean(id && /^[A-Za-z0-9_-]{11}$/.test(id)));
  if (!videoIds.length) return { items: [], nextCursor };
  const statusEndpoint = new URL('https://www.googleapis.com/youtube/v3/videos');
  statusEndpoint.searchParams.set('part', 'status');
  statusEndpoint.searchParams.set('id', videoIds.join(','));
  const statusResponse = await fetchYouTubeEndpoint(statusEndpoint, apiKey);
  if (!statusResponse.ok)
    throw new Error(`YouTube video status returned HTTP ${statusResponse.status}`);
  const statusPayload = (await statusResponse.json()) as {
    items?: Array<{ id?: string; status?: { embeddable?: boolean; madeForKids?: boolean } }>;
  };
  const embeddableIds = new Set(
    (Array.isArray(statusPayload.items) ? statusPayload.items : [])
      .filter((item) => item.status?.embeddable === true && item.status.madeForKids === false)
      .map((item) => item.id),
  );
  const fetchedAt = new Date().toISOString();
  const items = payload.items.flatMap((entry) => {
    const videoId = entry.id?.videoId;
    const snippet = entry.snippet;
    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId) || !snippet?.title) return [];
    const title = cleanText(snippet.title).slice(0, 320);
    const summary = cleanText(snippet.description).slice(0, 620);
    const [domain, domainKeywords] = classifyDomain(title, summary);
    const imageUrl = snippet.thumbnails?.medium?.url ?? snippet.thumbnails?.default?.url;
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const embedUrl = embeddableIds.has(videoId) ? youtubeEmbedUrl(url) : null;
    return [
      {
        id: `youtube-${videoId}`,
        section: 'social' as const,
        source: 'YouTube' as const,
        title,
        summary,
        author: cleanText(snippet.channelTitle).slice(0, 200),
        url,
        publishedAt: snippet.publishedAt ?? null,
        tags: ['YouTube', ...keywordTags(`${title} ${summary}`)].slice(0, 6),
        domain,
        domainKeywords,
        ...(imageUrl?.startsWith('https://') ? { imageUrl } : {}),
        ...(embedUrl ? { embedUrl } : {}),
        provenance: {
          mode: 'official_api' as const,
          sourceUrl: 'https://www.googleapis.com/youtube/v3/search',
          fetchedAt,
        },
      },
    ];
  });
  return { items, nextCursor };
}

export async function fetchYouTubeSearch(tags: string[]): Promise<HarvestItem[]> {
  return (await fetchYouTubeSearchPage(tags)).items;
}
