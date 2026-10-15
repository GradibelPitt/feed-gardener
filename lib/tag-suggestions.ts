import { apiSetting } from './api-settings.ts';
import { domains } from './feed.ts';
import type { ReadingLanguage } from './feed.ts';
import { fetchWithTimeout } from './crawler/core.ts';

export type TagSuggestion = {
  id: string;
  label: string;
  labelEn: string;
  displayLabel: string;
  translationStatus: 'translated' | 'source_label' | 'curated';
  origin: 'seed' | 'live';
  source: 'taxonomy' | 'github_topics';
  reason: string;
  evidenceUrl?: string;
  knownTagId?: string;
};

type GithubRepository = {
  html_url?: unknown;
  topics?: unknown;
};

const allTags = domains.flatMap((domain) =>
  domain.tags.map((tag) => ({ ...tag, domainId: domain.id })),
);

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim();

const slug = (value: string) =>
  value
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);

const technicalTranslations: Record<string, string> = {
  ai: 'AI',
  agent: '智能体',
  agents: '智能体',
  api: 'API',
  browser: '浏览器',
  cli: '命令行',
  code: '代码',
  computer: '计算机',
  database: '数据库',
  deep: '深度',
  developer: '开发者',
  distributed: '分布式',
  edge: '边缘',
  embedding: '嵌入',
  evaluation: '评测',
  generation: '生成',
  inference: '推理',
  language: '语言',
  llm: '大模型',
  local: '本地',
  machine: '机器',
  model: '模型',
  multimodal: '多模态',
  observability: '可观测性',
  rag: 'RAG',
  retrieval: '检索',
  robotics: '机器人',
  search: '搜索',
  semantic: '语义',
  system: '系统',
  systems: '系统',
  tool: '工具',
  tools: '工具',
  vector: '向量',
  vision: '视觉',
  web: 'Web',
};

const technicalEnglish: Record<string, string> = {
  ai: 'AI',
  api: 'API',
  cli: 'CLI',
  cpu: 'CPU',
  fastapi: 'FastAPI',
  gguf: 'GGUF',
  gpu: 'GPU',
  llm: 'LLM',
  mcp: 'MCP',
  rag: 'RAG',
  tui: 'TUI',
};

export function translateGithubTopicToZh(value: string): {
  label: string;
  status: 'translated' | 'source_label';
} {
  const parts = value
    .toLocaleLowerCase()
    .split(/[-_\s]+/)
    .filter(Boolean);
  if (!parts.length) return { label: value, status: 'source_label' };
  const translated = parts.map((part) => technicalTranslations[part]);
  if (translated.some((part) => !part)) return { label: value, status: 'source_label' };
  return { label: translated.join(''), status: 'translated' };
}

const displayLabel = (
  labelZh: string,
  labelEn: string,
  language: ReadingLanguage,
  translated: boolean,
) => {
  if (language === 'en') return labelEn;
  if (language === 'zh') return translated ? labelZh : `${labelEn}（原文）`;
  return translated && labelZh !== labelEn ? `${labelZh} / ${labelEn}` : labelEn;
};

export function seedTagSuggestions(
  selectedTagIds: string[],
  selectedDomainIds: string[],
  readingLanguage: ReadingLanguage = 'bilingual',
  limit = 8,
): TagSuggestion[] {
  const selectedTags = new Set(selectedTagIds);
  const selectedDomains = new Set(selectedDomainIds);
  for (const tag of allTags) {
    if (selectedTags.has(tag.id)) selectedDomains.add(tag.domainId);
  }
  return allTags
    .filter((tag) => selectedDomains.has(tag.domainId) && !selectedTags.has(tag.id))
    .slice(0, limit)
    .map((tag) => ({
      id: `seed:${tag.id}`,
      label: tag.label,
      labelEn: tag.labelEn,
      displayLabel: displayLabel(tag.label, tag.labelEn, readingLanguage, true),
      translationStatus: 'curated',
      origin: 'seed',
      source: 'taxonomy',
      reason: 'Same curated domain as a selected interest.',
      knownTagId: tag.id,
    }));
}

export function githubTopicSuggestions(
  repositories: GithubRepository[],
  excludedTerms: string[],
  readingLanguage: ReadingLanguage = 'bilingual',
  limit = 10,
): TagSuggestion[] {
  const excluded = new Set(excludedTerms.map(normalize));
  const candidates = new Map<string, TagSuggestion & { mentions: number }>();
  for (const repository of repositories) {
    if (!Array.isArray(repository.topics) || typeof repository.html_url !== 'string') continue;
    for (const raw of repository.topics) {
      if (typeof raw !== 'string') continue;
      const normalized = normalize(raw);
      const tagSlug = slug(raw);
      if (
        !normalized ||
        excluded.has(normalized) ||
        !tagSlug ||
        raw.length > 48 ||
        /^(github|open-source|hacktoberfest|awesome|tutorials?)$/.test(tagSlug)
      )
        continue;
      const previous = candidates.get(normalized);
      if (previous) {
        previous.mentions += 1;
      } else {
        const labelEn = raw
          .split(/[-_\s]+/)
          .filter(Boolean)
          .map(
            (part) =>
              technicalEnglish[part.toLowerCase()] ?? part.replace(/^\w/, (c) => c.toUpperCase()),
          )
          .join(' ');
        const localized = translateGithubTopicToZh(raw);
        candidates.set(normalized, {
          id: `live:github:${tagSlug}`,
          label: localized.label,
          labelEn,
          displayLabel: displayLabel(
            localized.label,
            labelEn,
            readingLanguage,
            localized.status === 'translated',
          ),
          translationStatus: localized.status,
          origin: 'live',
          source: 'github_topics',
          reason: 'Co-occurs on a recently updated public GitHub repository.',
          evidenceUrl: repository.html_url,
          mentions: 1,
        });
      }
    }
  }
  return [...candidates.values()]
    .sort((a, b) => b.mentions - a.mentions || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map(({ mentions: _mentions, ...suggestion }) => suggestion);
}

const queryTerms = (tagIds: string[], customTerms: string[]) => {
  const known = tagIds
    .map((id) => allTags.find((tag) => tag.id === id))
    .filter((tag): tag is (typeof allTags)[number] => Boolean(tag))
    .flatMap((tag) => [tag.labelEn, tag.label]);
  return [...new Set([...customTerms, ...known].map((term) => term.trim()).filter(Boolean))].slice(
    0,
    6,
  );
};

export async function fetchGithubTagSuggestions(
  tagIds: string[],
  customTerms: string[],
  readingLanguage: ReadingLanguage,
  excludeTerms: string[] = [],
): Promise<TagSuggestion[]> {
  const terms = queryTerms(tagIds, customTerms);
  if (!terms.length) return [];
  const headers: HeadersInit = { Accept: 'application/vnd.github+json' };
  if (apiSetting('github')) headers.Authorization = `Bearer ${apiSetting('github')}`;
  const topicQueries = tagIds
    .filter((id) => allTags.some((tag) => tag.id === id))
    .map((id) => `topic:${id}`);
  const fallbackQueries = terms.map((term) => `${term} in:name,description,readme`);
  const queries = [...new Set([...topicQueries, ...fallbackQueries])].slice(0, 2);
  const responses = await Promise.all(
    queries.map((query) =>
      fetchWithTimeout(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=8`,
        { headers },
        10_000,
      ),
    ),
  );
  const failed = responses.find((response) => !response.ok);
  if (failed) throw new Error(`GITHUB_SEARCH_${failed.status}`);
  const payloads = (await Promise.all(responses.map((response) => response.json()))) as Array<{
    items?: GithubRepository[];
  }>;
  return githubTopicSuggestions(
    payloads.flatMap((payload) => payload.items ?? []),
    [...terms, ...tagIds, ...excludeTerms],
    readingLanguage,
  );
}
