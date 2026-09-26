import type { HarvestItem } from './crawler/types';

export type KnowledgeState = 'inbox' | 'reviewing' | 'reference';
export const RESOURCE_TYPES = [
  'webpage',
  'article',
  'video',
  'paper',
  'repository',
  'social',
  'document',
  'audio',
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export type ResourceCollection = {
  id: string;
  name: string;
  createdAt: string;
};

export function nextDefaultCollectionName(collections: ResourceCollection[]): string {
  const names = new Set(collections.map((collection) => collection.name.toLowerCase()));
  const highestNumber = collections.reduce((highest, collection) => {
    const match = /^default folder (\d+)$/i.exec(collection.name);
    const number = match ? Number(match[1]) : 0;
    return Number.isSafeInteger(number) ? Math.max(highest, number) : highest;
  }, 0);
  let number = highestNumber + 1;
  while (names.has(`default folder ${number}`)) number += 1;
  return `default folder ${number}`;
}

export type ResourceRecord = {
  id: string;
  title: string;
  url: string;
  source: string;
  author: string;
  domain: string;
  tags: string[];
  summary: string;
  publishedAt: string | null;
  savedAt: string;
  note: string;
  knowledgeState: KnowledgeState;
  resourceType: ResourceType;
  collectionId: string | null;
  imageUrl?: string;
  embedUrl?: string;
};

export function readResourceCollections(value: unknown): ResourceCollection[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const names = new Set<string>();
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .flatMap((item) => {
      const id = typeof item.id === 'string' ? item.id.trim() : '';
      const name = typeof item.name === 'string' ? item.name.trim().slice(0, 60) : '';
      if (!id || id.length > 100 || !name || ids.has(id) || names.has(name.toLowerCase())) {
        return [];
      }
      ids.add(id);
      names.add(name.toLowerCase());
      return [
        {
          id,
          name,
          createdAt:
            typeof item.createdAt === 'string' ? item.createdAt : new Date(0).toISOString(),
        },
      ];
    })
    .slice(0, 50);
}

export function parseResourceUrl(value: string): URL | null {
  const input = value.trim();
  if (!input || input.length > 2_048) return null;
  try {
    const url = new URL(input);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

export function resourceWebsite(url: string): string {
  return parseResourceUrl(url)?.hostname.replace(/^www\./i, '') ?? 'Unknown';
}

export function resourceUrlKey(url: string): string {
  const parsed = parseResourceUrl(url);
  if (!parsed) return '';
  parsed.hash = '';
  parsed.hostname = parsed.hostname.replace(/^www\./i, '');
  return parsed.href.replace(/\/$/, '');
}

function videoDetails(
  url: string,
  proposedEmbed?: string,
): Pick<ResourceRecord, 'imageUrl' | 'embedUrl'> {
  const parsed = parseResourceUrl(url);
  if (!parsed) return {};
  const host = parsed.hostname.replace(/^www\./i, '');
  const bvid =
    host === 'bilibili.com'
      ? parsed.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10})\/?$/)?.[1]
      : null;
  if (bvid) return { embedUrl: `https://player.bilibili.com/player.html?bvid=${bvid}&autoplay=0` };
  const videoId =
    host === 'youtube.com' || host === 'm.youtube.com'
      ? parsed.searchParams.get('v')
      : host === 'youtu.be'
        ? parsed.pathname.slice(1)
        : null;
  if (videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    const expectedEmbed = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0`;
    return {
      imageUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      ...(proposedEmbed === expectedEmbed ? { embedUrl: expectedEmbed } : {}),
    };
  }
  return {};
}

function safeImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2_048) return undefined;
  const parsed = parseResourceUrl(value);
  return parsed?.protocol === 'https:' ? parsed.href : undefined;
}

export function inferResourceType(url: string, source = ''): ResourceType {
  const parsed = parseResourceUrl(url);
  const host = parsed?.hostname.replace(/^www\./i, '') ?? '';
  const path = parsed?.pathname.toLowerCase() ?? '';
  if (source === 'Google Scholar' || host === 'scholar.google.com') return 'paper';
  if (/\.(mp4|webm|mov)$/.test(path)) return 'video';
  if (/\.(mp3|wav|m4a|ogg)$/.test(path)) return 'audio';
  if (/\.(pdf|docx?|pptx?|xlsx?)$/.test(path)) return 'document';
  if (host === 'arxiv.org' || source === 'arXiv') return 'paper';
  if (host === 'github.com' || host === 'gitlab.com' || source === 'GitHub') return 'repository';
  if (
    [
      'youtube.com',
      'm.youtube.com',
      'youtu.be',
      'vimeo.com',
      'bilibili.com',
      'b23.tv',
      'tiktok.com',
    ].includes(host)
  )
    return 'video';
  if (['x.com', 'twitter.com', 'instagram.com', 'threads.net', 'facebook.com'].includes(host))
    return 'social';
  if (source === 'Hacker News') return 'article';
  return 'webpage';
}

export function resourceFromLink(
  rawUrl: string,
  title = '',
  resourceType?: ResourceType,
  now = new Date(),
): ResourceRecord | null {
  const url = parseResourceUrl(rawUrl);
  if (!url) return null;
  const website = resourceWebsite(url.href);
  const video = videoDetails(url.href);
  return {
    id: `link-${crypto.randomUUID()}`,
    title: title.trim().slice(0, 500) || website,
    url: url.href,
    source: website,
    author: '',
    domain: 'Other',
    tags: [],
    summary: '',
    publishedAt: null,
    savedAt: now.toISOString(),
    note: '',
    knowledgeState: 'inbox',
    resourceType: resourceType ?? inferResourceType(url.href),
    collectionId: null,
    ...video,
  };
}

export function resourceFromHarvest(item: HarvestItem, now = new Date()): ResourceRecord {
  const video = videoDetails(item.url, item.embedUrl);
  return {
    id: item.id,
    title: item.title,
    url: item.url,
    source: item.source,
    author: item.author,
    domain: item.domain,
    tags: [...new Set(item.tags)].slice(0, 12),
    summary: item.summary,
    publishedAt: item.publishedAt,
    savedAt: now.toISOString(),
    note: '',
    knowledgeState: 'inbox',
    resourceType: inferResourceType(item.url, item.source),
    collectionId: null,
    ...video,
    imageUrl: safeImageUrl(item.imageUrl) ?? video.imageUrl,
  };
}

export function readResourceRecords(value: unknown): ResourceRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .filter(
      (item) =>
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.url === 'string' &&
        parseResourceUrl(item.url) !== null,
    )
    .slice(0, 500)
    .map((item) => ({
      id: String(item.id),
      title: String(item.title).slice(0, 500),
      url: String(item.url),
      source: typeof item.source === 'string' ? item.source.slice(0, 80) : 'Unknown',
      author: typeof item.author === 'string' ? item.author.slice(0, 200) : 'Unknown',
      domain: typeof item.domain === 'string' ? item.domain.slice(0, 120) : 'Other',
      tags: Array.isArray(item.tags)
        ? item.tags
            .filter((tag): tag is string => typeof tag === 'string')
            .map((tag) => tag.slice(0, 80))
            .slice(0, 12)
        : [],
      summary: typeof item.summary === 'string' ? item.summary.slice(0, 2_000) : '',
      publishedAt: typeof item.publishedAt === 'string' ? item.publishedAt : null,
      savedAt: typeof item.savedAt === 'string' ? item.savedAt : new Date(0).toISOString(),
      note: typeof item.note === 'string' ? item.note.slice(0, 10_000) : '',
      knowledgeState: ['inbox', 'reviewing', 'reference'].includes(String(item.knowledgeState))
        ? (item.knowledgeState as KnowledgeState)
        : 'inbox',
      resourceType: RESOURCE_TYPES.includes(item.resourceType as ResourceType)
        ? (item.resourceType as ResourceType)
        : inferResourceType(String(item.url), String(item.source ?? '')),
      collectionId:
        typeof item.collectionId === 'string' && item.collectionId.length <= 100
          ? item.collectionId
          : null,
      ...videoDetails(
        String(item.url),
        typeof item.embedUrl === 'string' ? item.embedUrl : undefined,
      ),
      imageUrl: safeImageUrl(item.imageUrl) ?? videoDetails(String(item.url)).imageUrl,
    }));
}
