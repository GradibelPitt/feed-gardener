import { fetchArxiv } from './arxiv.ts';
import { academicPendingHealth, fetchFreeAcademic } from './academic.ts';
import { fetchBilibiliSearchPage } from './bilibili.ts';
import { fetchGithub } from './github.ts';
import {
  fetchGoogleScholar,
  scholarConfigured,
  scholarKeyRevision,
  scholarPendingHealth,
} from './google-scholar.ts';
import { fetchHackerNews } from './hackernews.ts';
import { socialHealth } from './social.ts';
import {
  fetchYouTubeSearchPage,
  youtubeSearchConfigured,
  youtubeSearchKeyRevision,
} from './youtube.ts';
import type {
  FeedSection,
  HarvestItem,
  HarvestPayload,
  LiveSource,
  SourceHealth,
} from './types.ts';

const CACHE_TTL_MS = 5 * 60_000;
const cached = new Map<string, { expiresAt: number; payload: HarvestPayload }>();

type SourceResult = {
  source: LiveSource;
  section: FeedSection;
  items: HarvestItem[];
  warning?: string;
  nextCursor?: string | null;
};

async function collect(
  source: LiveSource,
  section: FeedSection,
  run: () => Promise<HarvestItem[] | { items: HarvestItem[]; nextCursor: string | null }>,
): Promise<SourceResult> {
  try {
    const result = await run();
    return Array.isArray(result)
      ? { source, section, items: result }
      : { source, section, ...result };
  } catch (error) {
    return {
      source,
      section,
      items: [],
      warning: `${source}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function healthFor(result: SourceResult): SourceHealth {
  const live = result.items.length > 0;
  const failed = Boolean(result.warning);
  return {
    source: result.source,
    section: result.section,
    state: failed ? 'error' : live ? 'live' : 'limited',
    label: failed ? '本次刷新失败' : live ? '实时公开源' : '暂无新内容',
    labelEn: failed ? 'Refresh failed' : live ? 'Live public source' : 'No current items',
    detail: live
      ? `本次读取并去重 ${result.items.length} 条公开内容。`
      : failed
        ? '该来源失败未阻塞其他板块；可稍后单独重试。'
        : '请求成功，但没有可展示的新内容。',
    detailEn: live
      ? `${result.items.length} public items read and normalized in this refresh.`
      : failed
        ? 'This source failed without blocking other sections; retry later.'
        : 'The request succeeded, but returned no current items.',
    itemCount: result.items.length,
  };
}

function dedupe(items: HarvestItem[]): HarvestItem[] {
  const byUrl = new Map<string, HarvestItem>();
  for (const item of items) {
    const key = item.url.replace(/\/$/, '').toLowerCase();
    const current = byUrl.get(key);
    if (!current || (item.publishedAt ?? '') > (current.publishedAt ?? '')) byUrl.set(key, item);
  }
  return [...byUrl.values()].sort((a, b) => {
    const timeOrder = (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');
    if (timeOrder) return timeOrder;
    return (
      (b.metrics?.stars ?? b.metrics?.score ?? 0) - (a.metrics?.stars ?? a.metrics?.score ?? 0)
    );
  });
}

export async function harvestPublicSources(
  forceRefresh = false,
  youtubeTags: string[] = [],
  source?: LiveSource,
  localizedTags: string[] = [],
  cursor?: string,
): Promise<HarvestPayload> {
  const now = Date.now();
  const terms = youtubeTags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 2);
  const cacheKey = `${source ?? 'all'}\u0001${terms.join('\u0000')}\u0001${localizedTags.join('\u0000')}\u0001${cursor ?? ''}\u0001${youtubeSearchKeyRevision()}\u0001${scholarKeyRevision()}`;
  const snapshot = cached.get(cacheKey);
  if (!forceRefresh && snapshot && snapshot.expiresAt > now) {
    return { ...snapshot.payload, cache: 'hit' };
  }

  const previous = snapshot?.payload ?? null;
  const results = await Promise.all([
    ...(!source || source === 'arXiv' ? [collect('arXiv', 'academic', () => fetchArxiv(14))] : []),
    ...((!source || source === 'Semantic Scholar') && terms.length
      ? [
          collect('Semantic Scholar', 'academic', () =>
            fetchFreeAcademic('Semantic Scholar', terms),
          ),
        ]
      : []),
    ...((!source || source === 'Crossref') && terms.length
      ? [collect('Crossref', 'academic', () => fetchFreeAcademic('Crossref', terms))]
      : []),
    ...(source === 'Google Scholar' && scholarConfigured() && terms.length
      ? [collect('Google Scholar', 'academic', () => fetchGoogleScholar(terms))]
      : []),
    ...(!source || source === 'GitHub' ? [collect('GitHub', 'opensource', fetchGithub)] : []),
    ...(!source || source === 'Hacker News'
      ? [collect('Hacker News', 'opensource', fetchHackerNews)]
      : []),
    ...((!source || source === 'YouTube') && youtubeSearchConfigured() && terms.length
      ? [collect('YouTube', 'social', () => fetchYouTubeSearchPage(terms, localizedTags, cursor))]
      : []),
    ...((!source || source === 'Bilibili') && terms.length
      ? [collect('Bilibili', 'social', () => fetchBilibiliSearchPage(terms, localizedTags, cursor))]
      : []),
  ]);
  const social = dedupe(
    results.filter((result) => result.section === 'social').flatMap((result) => result.items),
  );
  const academic = dedupe(
    results.filter((result) => result.section === 'academic').flatMap((result) => result.items),
  );
  const opensource = dedupe(
    results.filter((result) => result.section === 'opensource').flatMap((result) => result.items),
  );
  const noFreshItems = social.length === 0 && academic.length === 0 && opensource.length === 0;

  if (
    noFreshItems &&
    results.length > 0 &&
    results.every((result) => Boolean(result.warning)) &&
    previous &&
    (previous.sections.social.length ||
      previous.sections.academic.length ||
      previous.sections.opensource.length)
  ) {
    return {
      ...previous,
      cache: 'stale_fallback',
      health: previous.health.map((health) => {
        const failed = results.find((result) => result.source === health.source);
        return failed ? { ...healthFor(failed), itemCount: health.itemCount } : health;
      }),
      warnings: [
        ...results.flatMap((result) => (result.warning ? [result.warning] : [])),
        'All live sources failed; serving the last in-memory snapshot.',
      ],
    };
  }

  const payload: HarvestPayload = {
    generatedAt: new Date().toISOString(),
    cache: 'fresh',
    sections: { social, academic, opensource },
    health: [
      ...(source === 'Google Scholar' ? scholarPendingHealth(terms.length > 0) : []),
      ...((!source || source === 'Semantic Scholar') && !terms.length
        ? [academicPendingHealth('Semantic Scholar')]
        : []),
      ...((!source || source === 'Crossref') && !terms.length
        ? [academicPendingHealth('Crossref')]
        : []),
      ...socialHealth().filter((item) => !source || item.source === source),
      ...((!source || source === 'Bilibili') && !terms.length
        ? [
            {
              source: 'Bilibili' as const,
              section: 'social' as const,
              state: 'limited' as const,
              label: '等待兴趣',
              labelEn: 'Waiting for topics',
              detail: '选择兴趣后开始搜索',
              detailEn: 'Choose topics to search',
              itemCount: 0,
            },
          ]
        : []),
      ...((!source || source === 'YouTube') && youtubeSearchConfigured()
        ? terms.length
          ? []
          : [
              {
                source: 'YouTube' as const,
                section: 'social' as const,
                state: 'limited' as const,
                label: '等待兴趣',
                labelEn: 'Waiting for topics',
                detail: '选择兴趣后开始搜索',
                detailEn: 'Choose topics to search',
                itemCount: 0,
              },
            ]
        : !source || source === 'YouTube'
          ? [
              {
                source: 'YouTube' as const,
                section: 'social' as const,
                state: 'configuration_required' as const,
                label: '需要 API 配置',
                labelEn: 'API key required',
                detail: '服务器需配置 YouTube Data API key',
                detailEn: 'Configure a server-side YouTube Data API key',
                itemCount: 0,
              },
            ]
          : []),
      ...results.map(healthFor),
    ],
    warnings: results.flatMap((result) => (result.warning ? [result.warning] : [])),
    ...(source === 'YouTube' || source === 'Bilibili'
      ? { nextCursor: results.find((result) => result.source === source)?.nextCursor ?? null }
      : {}),
    ...(!source
      ? {
          nextCursors: Object.fromEntries(
            results
              .filter((result) => result.source === 'YouTube' || result.source === 'Bilibili')
              .map((result) => [result.source, result.nextCursor ?? null]),
          ),
        }
      : {}),
  };
  cached.delete(cacheKey);
  cached.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, payload });
  while (cached.size > 32) cached.delete(cached.keys().next().value!);
  return payload;
}
