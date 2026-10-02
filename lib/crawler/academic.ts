import { classifyDomain, cleanText, fetchWithTimeout, keywordTags, stableId } from './core.ts';
import type { HarvestItem, SourceHealth } from './types.ts';

export type FreeAcademicSource = 'Semantic Scholar' | 'Crossref';
const ENDPOINTS: Record<FreeAcademicSource, string> = {
  'Semantic Scholar': 'https://api.semanticscholar.org/graph/v1/paper/search/bulk',
  Crossref: 'https://api.crossref.org/works',
};
const requestState = new Map<FreeAcademicSource, { busy: boolean; retryAt: number }>();

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? cleanText(value) : '';
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function doiUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !/^10\.\d{4,9}\/\S+$/i.test(value.trim())) return null;
  return `https://doi.org/${value.trim().toLowerCase().split('/').map(encodeURIComponent).join('/')}`;
}

// Partial publication dates stay in the summary, never become invented January 1 dates.
function fullDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? date.toISOString()
    : null;
}

export function parseAcademicResults(
  source: FreeAcademicSource,
  entries: unknown[],
  now = new Date(),
): HarvestItem[] {
  const seen = new Set<string>();
  return entries
    .flatMap((value): HarvestItem[] => {
      const entry = record(value);
      const crossref = source === 'Crossref';
      const title = text(crossref ? array(entry.title)[0] : entry.title);
      const url =
        doiUrl(crossref ? entry.DOI : record(entry.externalIds).DOI) ??
        safeUrl(crossref ? entry.URL : entry.url);
      if (!title || !url || seen.has(url)) return [];
      seen.add(url);
      const authors = array(crossref ? entry.author : entry.authors)
        .map((value) => {
          const author = record(value);
          return crossref
            ? [text(author.given), text(author.family)].filter(Boolean).join(' ') ||
                text(author.name)
            : text(author.name);
        })
        .filter(Boolean);
      const dateParts = array(array(record(entry.published)['date-parts'])[0]);
      const date = crossref
        ? dateParts.length === 3 && dateParts.every(Number.isInteger)
          ? dateParts
              .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
              .join('-')
          : null
        : entry.publicationDate;
      const year = crossref ? dateParts[0] : entry.year;
      const summary = [
        text(entry.abstract),
        crossref ? text(array(entry['container-title'])[0]) : '',
        typeof year === 'number' && Number.isInteger(year) ? String(year) : '',
      ]
        .filter(Boolean)
        .join('\n');
      const [domain, domainKeywords] = classifyDomain(title, summary);
      return [
        {
          id: `${crossref ? 'crossref' : 'semantic-scholar'}-${stableId(url)}`,
          section: 'academic',
          source,
          title,
          summary,
          author: authors.join(', ') || 'Author unavailable',
          url,
          publishedAt: fullDate(date),
          tags: [source, ...keywordTags(`${title}\n${summary}`)].slice(0, 8),
          domain,
          domainKeywords,
          provenance: {
            mode: 'official_api',
            sourceUrl: ENDPOINTS[source],
            fetchedAt: now.toISOString(),
          },
        },
      ];
    })
    .slice(0, 20);
}

export function academicPendingHealth(source: FreeAcademicSource): SourceHealth {
  return {
    source,
    section: 'academic',
    state: 'limited',
    label: '等待兴趣',
    labelEn: 'Waiting for topics',
    detail: '选择兴趣后免费搜索，无需 API key',
    detailEn: 'Choose topics for free search; no API key required',
    itemCount: 0,
  };
}

export async function fetchFreeAcademic(
  source: FreeAcademicSource,
  tags: string[],
): Promise<HarvestItem[]> {
  const terms = [...new Set(tags.map((tag) => tag.trim().slice(0, 80)).filter(Boolean))].slice(
    0,
    2,
  );
  if (!terms.length) return [];
  const state = requestState.get(source) ?? { busy: false, retryAt: 0 };
  requestState.set(source, state);
  if (state.busy) throw new Error(`${source} search is already running. Try again shortly.`);
  if (Date.now() < state.retryAt) {
    throw new Error(
      `${source} rate limit: retry in ${Math.ceil((state.retryAt - Date.now()) / 1000)} seconds.`,
    );
  }
  const url = new URL(ENDPOINTS[source]);
  if (source === 'Crossref') {
    url.searchParams.set('query.bibliographic', terms.join(' '));
    url.searchParams.set('rows', '20');
    url.searchParams.set('select', 'DOI,title,abstract,author,URL,published,container-title');
  } else {
    // Bulk search supports OR and avoids the heavily throttled relevance-search endpoint.
    url.searchParams.set(
      'query',
      terms.map((term) => `"${term.replace(/["\\]/g, ' ')}"`).join(' | '),
    );
    url.searchParams.set('fields', 'title,abstract,authors,url,publicationDate,year,externalIds');
    url.searchParams.set('sort', 'publicationDate:desc');
  }
  state.busy = true;
  try {
    let response: Response;
    try {
      response = await fetchWithTimeout(url.toString(), {}, 20_000);
    } catch {
      throw new Error(`${source} request could not be completed. Try again later.`);
    }
    if (response.status === 429) {
      const retry = response.headers.get('retry-after');
      const seconds = retry === null ? NaN : Number(retry);
      const retryAt = Number.isFinite(seconds)
        ? Date.now() + seconds * 1000
        : Date.parse(retry ?? '');
      state.retryAt = Math.max(Date.now() + 60_000, Number.isFinite(retryAt) ? retryAt : 0);
      throw new Error(
        `${source} rate limit reached. Retry later or choose the other free academic source.`,
      );
    }
    if (!response.ok) throw new Error(`${source} search returned HTTP ${response.status}.`);
    let payload: Record<string, unknown>;
    try {
      payload = record(await response.json());
    } catch {
      throw new Error(`${source} returned an invalid response. Try again later.`);
    }
    const entries = source === 'Crossref' ? record(payload.message).items : payload.data;
    if (!Array.isArray(entries))
      throw new Error(`${source} returned an incomplete response. Try again later.`);
    return parseAcademicResults(source, entries);
  } finally {
    state.busy = false;
    // Bound concurrency and spacing even on force refresh; no automatic retry loop.
    state.retryAt = Math.max(state.retryAt, Date.now() + 1000);
  }
}
