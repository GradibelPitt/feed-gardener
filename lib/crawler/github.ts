import { apiSetting } from '../api-settings.ts';
import { XMLParser } from 'fast-xml-parser';
import {
  classifyDomain,
  cleanText,
  fetchWithTimeout,
  githubRepoPath,
  keywordTags,
  normalizeGithubUrl,
  stableId,
  toArray,
} from './core.ts';
import type { HarvestItem } from './types.ts';

const TRENDING_RSS = 'https://mshibanami.github.io/GitHubTrendingRSS/weekly/all.xml';
const GITHUB_SEARCH = 'https://api.github.com/search/repositories';

type RssItem = {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
};

export function parseGithubTrendingRss(xml: string, now = new Date()): HarvestItem[] {
  const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
  const parsed = parser.parse(xml) as {
    rss?: { channel?: { item?: RssItem | RssItem[] } };
  };
  const fetchedAt = now.toISOString();

  return toArray(parsed.rss?.channel?.item)
    .slice(0, 30)
    .flatMap((row): HarvestItem[] => {
      const repo = githubRepoPath(cleanText(row.link) || cleanText(row.title));
      if (!repo) return [];
      const url = normalizeGithubUrl(cleanText(row.link) || `https://github.com/${repo}`);
      const summary = cleanText(row.description) || 'GitHub trending repository';
      const published = new Date(String(row.pubDate ?? ''));
      const [domain, domainKeywords] = classifyDomain(repo, summary);
      return [
        {
          id: `github-${stableId(url.toLowerCase())}`,
          section: 'opensource',
          source: 'GitHub',
          title: repo,
          summary,
          author: repo.split('/')[0],
          url,
          publishedAt: Number.isFinite(published.getTime()) ? published.toISOString() : null,
          tags: [...new Set(['GitHub', ...keywordTags(`${repo} ${summary}`)])].slice(0, 7),
          domain,
          domainKeywords,
          provenance: {
            mode: 'public_feed',
            sourceUrl: TRENDING_RSS,
            fetchedAt,
          },
        },
      ];
    });
}

async function fetchGithubSearchFallback(): Promise<HarvestItem[]> {
  const pushedAfter = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const url = new URL(GITHUB_SEARCH);
  url.searchParams.set('q', `stars:>500 pushed:>=${pushedAfter} archived:false`);
  url.searchParams.set('sort', 'stars');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('per_page', '24');
  const response = await fetchWithTimeout(
    url.toString(),
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(apiSetting('github') ? { Authorization: `Bearer ${apiSetting('github').trim()}` } : {}),
      },
    },
    15_000,
  );
  if (!response.ok) throw new Error(`GitHub Search HTTP ${response.status}`);
  const payload = (await response.json()) as {
    items?: Array<{
      full_name?: string;
      html_url?: string;
      description?: string;
      owner?: { login?: string };
      language?: string;
      topics?: string[];
      stargazers_count?: number;
      pushed_at?: string;
    }>;
  };
  const fetchedAt = new Date().toISOString();
  return (payload.items ?? []).flatMap((row): HarvestItem[] => {
    const title = cleanText(row.full_name);
    const url = cleanText(row.html_url);
    if (!title || !url) return [];
    const summary = cleanText(row.description) || 'Active public GitHub repository';
    const [domain, domainKeywords] = classifyDomain(title, summary);
    return [
      {
        id: `github-${stableId(url.toLowerCase())}`,
        section: 'opensource',
        source: 'GitHub',
        title,
        summary,
        author: cleanText(row.owner?.login) || title.split('/')[0],
        url,
        publishedAt: row.pushed_at || null,
        tags: [
          ...new Set(['GitHub', cleanText(row.language), ...(row.topics ?? []).slice(0, 3)]),
        ].filter(Boolean),
        domain,
        domainKeywords,
        metrics: { stars: row.stargazers_count },
        provenance: {
          mode: 'official_api',
          sourceUrl: GITHUB_SEARCH,
          fetchedAt,
        },
      },
    ];
  });
}

export async function fetchGithub(): Promise<HarvestItem[]> {
  try {
    const response = await fetchWithTimeout(TRENDING_RSS, {}, 15_000);
    if (!response.ok) throw new Error(`GitHub Trending RSS HTTP ${response.status}`);
    const items = parseGithubTrendingRss(await response.text());
    if (!items.length) throw new Error('GitHub Trending RSS returned no repositories');
    return items;
  } catch (rssError) {
    try {
      return await fetchGithubSearchFallback();
    } catch (apiError) {
      throw new Error(
        `GitHub sources failed: ${rssError instanceof Error ? rssError.message : rssError}; ${apiError instanceof Error ? apiError.message : apiError}`,
      );
    }
  }
}
