import { domains } from '../feed.ts';
import { classifyDomain, cleanText, fetchWithTimeout, keywordTags } from './core.ts';
import type { HarvestItem } from './types.ts';
import { fetchBilibiliViaTls } from './bilibili-transport.ts';
import { parseVideoDuration } from '../short-video.ts';

const SEARCH_URL = 'https://api.bilibili.com/x/web-interface/wbi/search/type';
const APP_SEARCH_URL = 'https://app.bilibili.com/x/v2/search';
const SEARCH_HOME_URL = 'https://search.bilibili.com/';
const BILIBILI_HEADERS = {
  Referer: SEARCH_HOME_URL,
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json',
};
const isHostedWorker = () =>
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

async function requestBilibili(
  endpoint: string,
  headers: Record<string, string>,
): Promise<Response> {
  if (isHostedWorker()) {
    try {
      const response = await fetchBilibiliViaTls(endpoint);
      if (response.status !== 412) return response;
    } catch {
      // A restricted socket falls back to the standard Worker request.
    }
  }
  return fetchWithTimeout(endpoint, { headers });
}
const catalog = domains.flatMap((domain) => domain.tags);
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().trim();

type SearchVideo = {
  bvid?: unknown;
  title?: unknown;
  description?: unknown;
  author?: unknown;
  pic?: unknown;
  tag?: unknown;
  pubdate?: unknown;
  duration?: unknown;
};

function bilibiliDuration(value: unknown): number | undefined {
  if (typeof value === 'number')
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  return typeof value === 'string' ? parseVideoDuration(value) : undefined;
}

export function bilibiliSearchTerms(tags: string[], localizedTags: string[] = []): string[] {
  return [
    ...new Set(
      tags.slice(0, 2).flatMap((value, index) => {
        const original = value.normalize('NFKC').trim().slice(0, 80);
        if (!original) return [];
        const known = catalog.find((tag) =>
          [tag.id, tag.label, tag.labelEn].some(
            (label) => normalize(label) === normalize(original),
          ),
        );
        const localized = localizedTags[index]?.normalize('NFKC').trim().slice(0, 80);
        return known
          ? [known.labelEn, known.label]
          : localized
            ? [original, localized]
            : [original];
      }),
    ),
  ].slice(0, 4);
}

function catalogMatches(text: string): string[] {
  const normalized = normalize(text);
  return catalog
    .filter((tag) =>
      [tag.label, tag.labelEn].some((label) => {
        const needle = normalize(label);
        if (!needle) return false;
        if (/^[a-z0-9 ]+$/i.test(needle)) {
          return new RegExp(
            `(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`,
            'i',
          ).test(normalized);
        }
        return normalized.includes(needle);
      }),
    )
    .map((tag) => tag.id);
}

export function bilibiliEmbedUrl(bvid: string): string | null {
  return /^BV[0-9A-Za-z]{10}$/.test(bvid)
    ? `https://player.bilibili.com/player.html?bvid=${bvid}&autoplay=0`
    : null;
}

export function parseBilibiliSearch(
  payload: unknown,
  fetchedAt = new Date().toISOString(),
  sourceUrl = SEARCH_URL,
): HarvestItem[] {
  const response = payload as {
    code?: unknown;
    data?: { result?: unknown; v_voucher?: unknown };
  } | null;
  if (response?.code === -352 || response?.data?.v_voucher)
    throw new Error('Bilibili requires verification for this connection; try again later');
  if (response?.code !== 0 || !Array.isArray(response.data?.result))
    throw new Error('Bilibili search returned invalid data');
  return response.data.result.flatMap((entry: SearchVideo) => {
    const bvid = typeof entry.bvid === 'string' ? entry.bvid : '';
    const embedUrl = bilibiliEmbedUrl(bvid);
    if (!embedUrl) return [];
    const title = cleanText(entry.title).slice(0, 320);
    if (!title) return [];
    const summary = cleanText(entry.description).slice(0, 620);
    const rawTags =
      typeof entry.tag === 'string'
        ? entry.tag
            .split(',')
            .map((tag) => cleanText(tag).slice(0, 64))
            .filter(Boolean)
        : [];
    const [domain, domainKeywords] = classifyDomain(title, summary);
    const pic = typeof entry.pic === 'string' ? entry.pic : '';
    const imageUrl = pic.startsWith('//') ? `https:${pic}` : pic;
    const publishedAt =
      typeof entry.pubdate === 'number' && Number.isFinite(entry.pubdate)
        ? new Date(entry.pubdate * 1000).toISOString()
        : null;
    const durationSeconds = bilibiliDuration(entry.duration);
    return [
      {
        id: `bilibili-${bvid}`,
        section: 'social' as const,
        source: 'Bilibili' as const,
        title,
        summary,
        author: cleanText(entry.author).slice(0, 200),
        url: `https://www.bilibili.com/video/${bvid}`,
        publishedAt,
        tags: [
          ...new Set([
            'Bilibili',
            ...catalogMatches([title, ...rawTags].join(' ')),
            ...rawTags,
            ...keywordTags(`${title} ${summary}`),
          ]),
        ].slice(0, 16),
        domain,
        domainKeywords,
        ...(imageUrl.startsWith('https://') ? { imageUrl } : {}),
        embedUrl,
        ...(durationSeconds ? { durationSeconds } : {}),
        provenance: { mode: 'public_api' as const, sourceUrl, fetchedAt },
      },
    ];
  });
}

export function parseBilibiliAppSearch(
  payload: unknown,
  fetchedAt = new Date().toISOString(),
): HarvestItem[] {
  const response = payload as {
    code?: unknown;
    data?: { item?: unknown; v_voucher?: unknown };
  } | null;
  if (response?.code === -352 || response?.data?.v_voucher)
    throw new Error('Bilibili requires verification for this connection; try again later');
  if (
    response?.code !== 0 ||
    !response.data ||
    (response.data.item !== undefined && !Array.isArray(response.data.item))
  )
    throw new Error('Bilibili app search returned invalid data');
  const entries = Array.isArray(response.data.item) ? response.data.item : [];
  const result = entries.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const video = entry as {
      goto?: unknown;
      share?: { video?: { bvid?: unknown } };
      title?: unknown;
      author?: unknown;
      cover?: unknown;
      ptime?: unknown;
      duration?: unknown;
    };
    if (video.goto !== 'av') return [];
    const published = Number(video.ptime);
    return [
      {
        bvid: video.share?.video?.bvid,
        title: video.title,
        author: video.author,
        pic: video.cover,
        pubdate: Number.isFinite(published) && published > 0 ? published : undefined,
        duration: video.duration,
      },
    ];
  });
  return parseBilibiliSearch({ code: 0, data: { result } }, fetchedAt, APP_SEARCH_URL);
}

async function searchPage(
  term: string,
  page: number,
  before?: number,
  session?: { appPreferred: boolean },
): Promise<{ items: HarvestItem[]; hasMore: boolean; mode: 'web' | 'app' }> {
  if (session?.appPreferred) return searchAppPage(term, 1);
  const endpoint = new URL(SEARCH_URL);
  endpoint.searchParams.set('search_type', 'video');
  endpoint.searchParams.set('keyword', term);
  endpoint.searchParams.set('order', 'pubdate');
  endpoint.searchParams.set('page', String(page));
  if (before !== undefined) {
    endpoint.searchParams.set('pubtime_begin_s', '1');
    endpoint.searchParams.set('pubtime_end_s', String(before));
  }
  const response = await requestBilibili(endpoint.toString(), {
    ...BILIBILI_HEADERS,
    Referer: `${SEARCH_HOME_URL}all?keyword=${encodeURIComponent(term)}`,
  });
  if (response.status === 412 && session) {
    // The web endpoint can reject cloud traffic while the public app search remains available.
    session.appPreferred = true;
    return searchAppPage(term, 1);
  }
  if (!response.ok) throw new Error(`Bilibili search returned HTTP ${response.status}`);
  const payload = await response.json();
  const items = parseBilibiliSearch(payload);
  const numPages = Number(payload?.data?.numPages);
  return {
    items,
    hasMore: Number.isInteger(numPages) ? page < numPages : items.length >= 20,
    mode: 'web',
  };
}

async function searchAppPage(
  term: string,
  page: number,
): Promise<{ items: HarvestItem[]; hasMore: boolean; mode: 'app' }> {
  const endpoint = new URL(APP_SEARCH_URL);
  endpoint.searchParams.set('platform', 'android');
  endpoint.searchParams.set('build', '7800300');
  endpoint.searchParams.set('mobi_app', 'android');
  endpoint.searchParams.set('keyword', term);
  endpoint.searchParams.set('order', 'pubdate');
  endpoint.searchParams.set('pn', String(page));
  endpoint.searchParams.set('ps', '20');
  const response = await requestBilibili(endpoint.toString(), {
    ...BILIBILI_HEADERS,
    Referer: 'https://m.bilibili.com/',
  });
  if (!response.ok) throw new Error(`Bilibili app search returned HTTP ${response.status}`);
  const payload = await response.json();
  const items = parseBilibiliAppSearch(payload);
  const rawItems = payload?.data?.item;
  return {
    items,
    hasMore: page < 50 && Array.isArray(rawItems) && rawItems.length >= 20,
    mode: 'app',
  };
}

async function searchTerms(terms: string[], page: number) {
  const successes: { items: HarvestItem[]; hasMore: boolean }[] = [];
  const errors: string[] = [];
  const session = { appPreferred: false };
  // Bilibili can require verification after a burst of requests. Keep the
  // bilingual searches small and stop immediately when verification appears.
  for (const term of terms) {
    try {
      successes.push(await searchPage(term, page, undefined, session));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      if (message.includes('requires verification')) break;
    }
  }
  if (!successes.length)
    throw new Error(
      errors.find((message) => message.includes('requires verification')) ??
        errors[0] ??
        'Bilibili search could not be completed',
    );
  return successes;
}

export async function fetchBilibiliSearch(
  tags: string[],
  localizedTags: string[] = [],
): Promise<HarvestItem[]> {
  const terms = bilibiliSearchTerms(tags, localizedTags);
  if (!terms.length) return [];
  const successes = await searchTerms(terms, 1);
  return [
    ...new Map(
      successes.flatMap((result) => result.items.slice(0, 12)).map((item) => [item.id, item]),
    ).values(),
  ].slice(0, 32);
}

export async function fetchBilibiliSearchPage(
  tags: string[],
  localizedTags: string[] = [],
  cursor?: string,
): Promise<{ items: HarvestItem[]; nextCursor: string | null }> {
  const terms = bilibiliSearchTerms(tags, localizedTags);
  if (!terms.length) return { items: [], nextCursor: null };
  let bounds: Array<number | null | false> = Array(terms.length).fill(null);
  let appPages: Array<number | null> = Array(terms.length).fill(null);
  if (cursor !== undefined) {
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as {
        bounds?: unknown;
        appPages?: unknown;
      };
      if (
        !Array.isArray(parsed.bounds) ||
        parsed.bounds.length !== terms.length ||
        parsed.bounds.some(
          (bound) =>
            bound !== null &&
            bound !== false &&
            (!Number.isInteger(bound) || bound < 1 || bound > Date.now() / 1000 + 86400),
        )
      )
        throw new Error('Invalid cursor');
      if (
        parsed.appPages !== undefined &&
        (!Array.isArray(parsed.appPages) ||
          parsed.appPages.length !== terms.length ||
          parsed.appPages.some(
            (page) => page !== null && (!Number.isInteger(page) || page < 1 || page > 50),
          ))
      )
        throw new Error('Invalid cursor');
      bounds = parsed.bounds as Array<number | null | false>;
      if (parsed.appPages) appPages = parsed.appPages as Array<number | null>;
    } catch {
      throw new Error('Invalid Bilibili search cursor');
    }
  }
  const nextBounds = [...bounds];
  const nextAppPages = [...appPages];
  const successes: HarvestItem[][] = [];
  const errors: string[] = [];
  const session = { appPreferred: false };
  for (let index = 0; index < terms.length; index += 1) {
    const bound = bounds[index];
    const appPage = appPages[index];
    if (bound === false && appPage === null) continue;
    try {
      const result = appPage
        ? await searchAppPage(terms[index], appPage)
        : await searchPage(terms[index], 1, bound || undefined, session);
      successes.push(result.items);
      if (result.mode === 'app') {
        nextBounds[index] = false;
        nextAppPages[index] = result.hasMore ? (appPage ?? 1) + 1 : null;
        continue;
      }
      const oldest = Math.min(
        ...result.items
          .map((item) => (item.publishedAt ? Date.parse(item.publishedAt) / 1000 : NaN))
          .filter(Number.isFinite),
      );
      nextBounds[index] =
        result.items.length > 0 &&
        Number.isFinite(oldest) &&
        oldest > 1 &&
        (bound === null || (typeof bound === 'number' && oldest < bound))
          ? Math.floor(oldest) - 1
          : false;
      nextAppPages[index] = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      if (message.includes('requires verification')) break;
    }
  }
  if (!successes.length)
    throw new Error(
      errors.find((message) => message.includes('requires verification')) ??
        errors[0] ??
        'Bilibili search could not be completed',
    );
  return {
    items: [...new Map(successes.flat().map((item) => [item.id, item])).values()],
    nextCursor:
      nextBounds.some((bound) => bound !== false) || nextAppPages.some((page) => page !== null)
        ? Buffer.from(JSON.stringify({ bounds: nextBounds, appPages: nextAppPages })).toString(
            'base64url',
          )
        : null,
  };
}
