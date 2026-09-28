import { classifyDomain, cleanText, fetchWithTimeout, keywordTags, stableId } from './core.ts';
import type { HarvestItem, SourceHealth } from './types.ts';

const SCHOLAR_API = 'https://serpapi.com/search.json';
type ScholarRuntime = { apiKey: string | null; revision: number };
const runtime = globalThis as typeof globalThis & { __feederScholarSearch?: ScholarRuntime };

function searchRuntime(): ScholarRuntime {
  return (runtime.__feederScholarSearch ??= { apiKey: null, revision: 0 });
}

function scholarApiKey(): string {
  return searchRuntime().apiKey ?? process.env.SERPAPI_API_KEY?.trim() ?? '';
}

export function setScholarApiKey(apiKey: string | null): void {
  const state = searchRuntime();
  state.apiKey = apiKey;
  state.revision += 1;
}

export function scholarKeyRevision(): number {
  return searchRuntime().revision;
}

export function scholarConfigured(): boolean {
  return Boolean(scholarApiKey());
}

export function scholarPendingHealth(hasTopics: boolean): SourceHealth[] {
  const configured = scholarConfigured();
  if (configured && hasTopics) return [];
  return [
    {
      source: 'Google Scholar',
      section: 'academic',
      state: configured ? 'limited' : 'configuration_required',
      label: configured ? '等待兴趣' : '需要 SerpApi key',
      labelEn: configured ? 'Waiting for topics' : 'SerpApi key required',
      detail: configured ? '选择兴趣后开始搜索' : '使用 SerpApi 连接 Google Scholar',
      detailEn: configured ? 'Choose topics to search' : 'Connect Google Scholar through SerpApi',
      itemCount: 0,
    },
  ];
}

type ScholarResult = {
  title?: string;
  link?: string;
  snippet?: string;
  publication_info?: { summary?: string; authors?: Array<{ name?: string }> };
  resources?: Array<{ link?: string }>;
};

function paperUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function parseScholarResults(results: ScholarResult[], now = new Date()): HarvestItem[] {
  const seen = new Set<string>();
  return results.flatMap((entry): HarvestItem[] => {
    if (!entry || typeof entry !== 'object') return [];
    const title = cleanText(entry.title);
    const url =
      paperUrl(entry.link) ??
      (Array.isArray(entry.resources)
        ? entry.resources.map((resource) => paperUrl(resource?.link)).find(Boolean)
        : null);
    if (!title || !url || seen.has(url)) return [];
    seen.add(url);
    const publication = cleanText(entry.publication_info?.summary);
    const summary = [cleanText(entry.snippet), publication].filter(Boolean).join('\n');
    const authors = Array.isArray(entry.publication_info?.authors)
      ? entry.publication_info.authors.map((author) => cleanText(author?.name)).filter(Boolean)
      : [];
    const [domain, domainKeywords] = classifyDomain(title, summary);
    return [
      {
        id: `google-scholar-${stableId(url)}`,
        section: 'academic',
        source: 'Google Scholar',
        title,
        summary,
        author: authors?.join(', ') || 'Author unavailable',
        url,
        // Scholar typically reports only a year; do not invent a month and day.
        publishedAt: null,
        tags: ['Google Scholar', ...keywordTags(`${title}\n${summary}`)].slice(0, 8),
        domain,
        domainKeywords,
        provenance: { mode: 'public_api', sourceUrl: SCHOLAR_API, fetchedAt: now.toISOString() },
      },
    ];
  });
}

export async function fetchGoogleScholar(tags: string[]): Promise<HarvestItem[]> {
  const apiKey = scholarApiKey();
  const terms = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 2);
  if (!apiKey || !terms.length) return [];
  const url = new URL(SCHOLAR_API);
  url.searchParams.set('engine', 'google_scholar');
  url.searchParams.set('q', terms.map((term) => `(${term})`).join(' OR '));
  url.searchParams.set('num', '20');
  url.searchParams.set('hl', 'en');
  url.searchParams.set('as_vis', '1');
  url.searchParams.set('api_key', apiKey);
  let response: Response;
  let payload: {
    organic_results?: ScholarResult[];
    error?: string;
    search_metadata?: { status?: string };
    search_information?: { total_results?: number };
  };
  try {
    response = await fetchWithTimeout(url.toString(), {}, 20_000);
    if (response.ok) payload = await response.json();
    else payload = {};
  } catch {
    // Transport and JSON errors can contain credential-bearing request URLs.
    throw new Error('Google Scholar request could not be completed. Try again.');
  }
  if (response.status === 401 || response.status === 403)
    throw new Error('SerpApi rejected the API key. Check your key and account.');
  if (response.status === 429)
    throw new Error('SerpApi search limit reached. Check your quota or try again later.');
  if (!response.ok) throw new Error(`Google Scholar search returned HTTP ${response.status}`);
  if (
    payload?.search_metadata?.status === 'Success' &&
    payload.search_information?.total_results === 0
  )
    return [];
  if (!payload || payload.error || payload.search_metadata?.status === 'Error')
    throw new Error(
      'SerpApi could not complete the Google Scholar search. Check your key and quota.',
    );
  if (!Array.isArray(payload.organic_results))
    throw new Error('Google Scholar returned an incomplete response. Try again.');
  return parseScholarResults(payload.organic_results.slice(0, 20));
}
