import { classifyDomain, cleanText, keywordTags, stableId } from './core.ts';
import type { HarvestItem } from './types.ts';
import { videoSearchTerms } from './video-search-terms.ts';
import demoSnapshots from './youtube-demo-snapshots.json' with { type: 'json' };

const ENDPOINT = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false';
const CLIENT_VERSION = '2.20261014.01.00';
const MAX_CURSOR = 24_000;
type RecordValue = Record<string, any>;
type Cursor = { v: 1; scope: string; index: number; tokens: (string | false | null)[] };
export type PublicYouTubePage = {
  items: HarvestItem[];
  nextCursor: string | null;
  warning?: string;
  cachedAt?: string;
};

function text(value: RecordValue | undefined): string {
  return cleanText(
    value?.simpleText ?? value?.runs?.map((run: RecordValue) => run.text ?? '').join('') ?? '',
  );
}

export function parseYouTubeSearch(
  payload: RecordValue,
  query: string,
): {
  items: HarvestItem[];
  continuation: string | null;
} {
  if (payload.error) throw new Error('YouTube search rejected the request');
  const initial =
    payload.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
      ?.contents;
  const actions = payload.onResponseReceivedCommands ?? payload.onResponseReceivedActions;
  const continued = Array.isArray(actions)
    ? actions.flatMap(
        (action: RecordValue) => action.appendContinuationItemsAction?.continuationItems ?? [],
      )
    : undefined;
  const contents = initial ?? continued;
  if (!Array.isArray(contents)) throw new Error('YouTube returned an unrecognized search response');
  const items = new Map<string, HarvestItem>();
  let continuation: string | null = null;
  const sourceUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const fetchedAt = new Date().toISOString();
  for (const section of contents) {
    const token =
      section.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
    if (typeof token === 'string' && /^[A-Za-z0-9_=%+\/-]{1,4096}$/.test(token))
      continuation = token;
    for (const entry of section.itemSectionRenderer?.contents ?? []) {
      const video = entry.videoRenderer;
      if (!video || !/^[A-Za-z0-9_-]{11}$/.test(video.videoId ?? '')) continue;
      const title = text(video.title).slice(0, 320);
      if (!title) continue;
      const summary = text(
        video.detailedMetadataSnippets?.[0]?.snippetText ?? video.descriptionSnippet,
      ).slice(0, 620);
      const [domain, domainKeywords] = classifyDomain(title, summary);
      const id = video.videoId;
      items.set(id, {
        id: `youtube-${id}`,
        section: 'social',
        source: 'YouTube',
        title,
        summary,
        author: text(video.ownerText ?? video.longBylineText).slice(0, 200),
        url: `https://www.youtube.com/watch?v=${id}`,
        // Search returns relative dates; do not invent exact publication timestamps.
        publishedAt: null,
        tags: ['YouTube', ...keywordTags(`${title} ${summary}`)].slice(0, 6),
        domain,
        domainKeywords,
        imageUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        provenance: { mode: 'public_api', sourceUrl, fetchedAt },
      });
    }
  }
  return { items: [...items.values()], continuation };
}

function readCursor(value: string | undefined, terms: string[]): Cursor {
  const scope = stableId(...terms);
  if (!value) return { v: 1, scope, index: 0, tokens: terms.map(() => null) };
  try {
    if (value.length > MAX_CURSOR || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const state = JSON.parse(Buffer.from(value, 'base64url').toString()) as Cursor;
    if (
      state.v !== 1 ||
      state.scope !== scope ||
      !Number.isInteger(state.index) ||
      state.index < 0 ||
      state.index >= terms.length ||
      !Array.isArray(state.tokens) ||
      state.tokens.length !== terms.length ||
      state.tokens[state.index] === false ||
      state.tokens.some(
        (token) =>
          token !== null &&
          token !== false &&
          (typeof token !== 'string' || !/^[A-Za-z0-9_=%+\/-]{1,4096}$/.test(token)),
      )
    )
      throw new Error();
    return state;
  } catch {
    throw new Error('Invalid YouTube search cursor');
  }
}

async function requestPublicYouTubeSearchPage(
  tags: string[],
  localizedTags: string[] = [],
  cursor?: string,
): Promise<PublicYouTubePage> {
  const terms = videoSearchTerms(tags, localizedTags);
  if (!terms.length) return { items: [], nextCursor: null };
  const state = readCursor(cursor, terms);
  const query = terms[state.index];
  const token = state.tokens[state.index];
  // Fetch and body parsing share a deadline. No login, cookie, API key, executable,
  // filesystem or player-script evaluation is needed by this Worker path.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  let payload: RecordValue;
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: {
          client: { clientName: 'WEB', clientVersion: CLIENT_VERSION, hl: 'en', gl: 'US' },
        },
        ...(token ? { continuation: token } : { query, params: 'EgIQAQ%3D%3D' }),
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`YouTube search returned HTTP ${response.status}`);
    const raw = await response.text();
    if (raw.length > 3_000_000) throw new Error('YouTube search response exceeded its size limit');
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error('YouTube returned a non-JSON search response');
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('YouTube search timed out');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const parsed = parseYouTubeSearch(payload, query);
  const tokens = [...state.tokens];
  tokens[state.index] = parsed.continuation ?? false;
  const index = Array.from(
    { length: terms.length },
    (_, offset) => (state.index + offset + 1) % terms.length,
  ).find((candidate) => tokens[candidate] !== false);
  const nextCursor =
    index === undefined
      ? null
      : Buffer.from(JSON.stringify({ ...state, index, tokens })).toString('base64url');
  return {
    items: parsed.items,
    nextCursor: nextCursor && nextCursor.length <= MAX_CURSOR ? nextCursor : null,
  };
}

type Snapshot = { items: HarvestItem[]; nextCursor: string | null; cachedAt: string };
const memory = new Map<string, Snapshot>();
const pending = new Map<string, Promise<PublicYouTubePage>>();
const snapshotLifetime = 7 * 24 * 60 * 60_000;

function workerCache(): Cache | undefined {
  return (globalThis as typeof globalThis & { caches?: CacheStorage & { default?: Cache } }).caches
    ?.default;
}

export async function fetchPublicYouTubeSearchPage(
  tags: string[],
  localizedTags: string[] = [],
  cursor?: string,
): Promise<PublicYouTubePage> {
  const terms = videoSearchTerms(tags, localizedTags);
  if (!terms.length) return { items: [], nextCursor: null };
  // Validate before any fallback: a cursor from different interests must fail.
  readCursor(cursor, terms);
  const key = stableId(...terms, cursor ?? '');
  const existing = pending.get(key);
  if (existing) return existing;
  const run = async (): Promise<PublicYouTubePage> => {
    const cacheUrl = `https://feed-gardener.gradibel.chatgpt.site/__youtube_snapshot/${key}`;
    try {
      const page = await requestPublicYouTubeSearchPage(tags, localizedTags, cursor);
      if (page.items.length) {
        const snapshot: Snapshot = { ...page, cachedAt: new Date().toISOString() };
        memory.set(key, snapshot);
        while (memory.size > 64) memory.delete(memory.keys().next().value!);
        try {
          await workerCache()?.put(
            cacheUrl,
            Response.json(snapshot, { headers: { 'Cache-Control': 'public, max-age=604800' } }),
          );
        } catch {
          /* Cache failure must not discard successful live results. */
        }
      }
      return page;
    } catch (error) {
      let snapshot = memory.get(key);
      if (!snapshot) {
        try {
          snapshot = (await (await workerCache()?.match(cacheUrl))?.json()) as Snapshot | undefined;
        } catch {
          /* A missing or damaged snapshot is not a live result. */
        }
      }
      if (!snapshot && !cursor)
        snapshot = (demoSnapshots as unknown as Record<string, Snapshot>)[terms[0].toLowerCase()];
      if (
        !snapshot ||
        !snapshot.items?.length ||
        Date.now() - Date.parse(snapshot.cachedAt) > snapshotLifetime
      )
        throw error;
      return {
        ...snapshot,
        warning: `YouTube live refresh failed; showing saved results from ${snapshot.cachedAt}.`,
      };
    }
  };
  const promise = run().finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}
