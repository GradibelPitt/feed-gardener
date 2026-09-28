export type FeedSection = 'social' | 'academic' | 'opensource';

export type LiveSource =
  | 'YouTube'
  | 'Bilibili'
  | 'TikTok'
  | 'Instagram'
  | 'X'
  | 'arXiv'
  | 'Google Scholar'
  | 'GitHub'
  | 'Hacker News';

export const LIVE_SOURCES: readonly LiveSource[] = [
  'YouTube',
  'Bilibili',
  'TikTok',
  'Instagram',
  'X',
  'arXiv',
  'Google Scholar',
  'GitHub',
  'Hacker News',
];

export type SourceState = 'live' | 'limited' | 'configuration_required' | 'error';

export type SourceHealth = {
  source: LiveSource;
  section: FeedSection;
  state: SourceState;
  label: string;
  labelEn: string;
  detail: string;
  detailEn: string;
  itemCount: number;
};

export type HarvestItem = {
  id: string;
  section: FeedSection;
  source: LiveSource;
  title: string;
  summary: string;
  author: string;
  url: string;
  publishedAt: string | null;
  tags: string[];
  domain: string;
  domainKeywords: string[];
  imageUrl?: string;
  embedUrl?: string;
  metrics?: {
    stars?: number;
    score?: number;
    comments?: number;
  };
  provenance: {
    mode: 'official_api' | 'public_api' | 'public_feed' | 'public_oembed';
    sourceUrl: string;
    fetchedAt: string;
  };
};

export type HarvestPayload = {
  generatedAt: string;
  cache: 'fresh' | 'hit' | 'stale_fallback';
  sections: Record<FeedSection, HarvestItem[]>;
  health: SourceHealth[];
  warnings: string[];
  nextCursor?: string | null;
  nextCursors?: Partial<Record<'YouTube' | 'Bilibili', string | null>>;
};
