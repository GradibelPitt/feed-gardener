'use client';
import { accountStorage } from '@/lib/account-storage';
import { useAccount } from './AccountProvider';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Code2,
  FileSearch,
  LoaderCircle,
  MessageCircle,
  Newspaper,
  RefreshCw,
  Share2,
  Sparkles,
} from 'lucide-react';
import type {
  FeedSection,
  HarvestItem,
  HarvestPayload,
  LiveSource,
  SourceHealth,
} from '@/lib/crawler/types';
import { appendHarvestPayload, mergeHarvestPayload } from '@/lib/crawler/merge';
import { readApiData } from '@/lib/api-contract';
import type { Locale } from '@/lib/locale';
import { matchesHarvestPreferences, type Preferences } from '@/lib/feed';
type Props = {
  locale: Locale;
  interestLabels: string[];
  localizedInterestLabels: string[];
  preferences: Preferences;
  initialPayload?: HarvestPayload | null;
  onHarvested?: (payload: HarvestPayload, append?: boolean, source?: LiveSource) => void;
  onVideoFetchStart?: (source: 'YouTube' | 'Bilibili') => void;
  onVideoFetchEnd?: () => void;
  onSocialImport?: (item: HarvestItem) => void;
  t: (zh: string, en: string) => string;
  onEditInterests: () => void;
};

const SOCIAL_STORAGE = 'feed-gardener-social-imports-v1';
const sectionSources: Record<FeedSection, LiveSource[]> = {
  social: ['YouTube', 'Bilibili'],
  academic: ['Semantic Scholar', 'Crossref', 'arXiv', 'Google Scholar'],
  opensource: ['GitHub', 'Hacker News'],
};
const urlSources = new Set<LiveSource>(['TikTok', 'Instagram', 'X']);
const sourcePrompt: Record<LiveSource, string> = {
  TikTok: 'Select to import a public URL',
  Instagram: 'Select to import a public URL',
  X: 'Select to import a public URL',
  YouTube: 'Select to fetch videos',
  Bilibili: 'Select to fetch videos',
  arXiv: 'Select to fetch papers',
  'Semantic Scholar': 'Free paper search · no key needed',
  Crossref: 'Free DOI search · no key needed',
  'Google Scholar': 'Select to fetch papers',
  GitHub: 'Select to fetch repositories',
  'Hacker News': 'Select to fetch stories',
};

const sectionMeta: Array<{
  id: FeedSection;
  icon: typeof Share2;
  zh: string;
  en: string;
  eyebrow: string;
}> = [
  {
    id: 'social',
    icon: Share2,
    zh: '社交雷达',
    en: 'Social radar',
    eyebrow: 'SOCIAL SIGNALS',
  },
  {
    id: 'academic',
    icon: BookOpen,
    zh: '学术前沿',
    en: 'Research frontier',
    eyebrow: 'ACADEMIC LENS',
  },
  {
    id: 'opensource',
    icon: Code2,
    zh: '开源社区',
    en: 'Open-source community',
    eyebrow: 'BUILD IN PUBLIC',
  },
];

const sourceMark: Record<LiveSource, string> = {
  YouTube: 'YT',
  Bilibili: 'B站',
  TikTok: 'TT',
  Instagram: 'IG',
  X: 'X',
  arXiv: 'AX',
  'Semantic Scholar': 'SS',
  Crossref: 'CR',
  'Google Scholar': 'GS',
  GitHub: 'GH',
  'Hacker News': 'HN',
};

function healthText(health: SourceHealth, locale: Locale): string {
  return locale === 'zh' ? health.label : health.labelEn;
}

function urlMatchesSource(value: string, source: LiveSource): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (source === 'TikTok') return host === 'tiktok.com' || host.endsWith('.tiktok.com');
    if (source === 'Instagram') return host === 'instagram.com' || host.endsWith('.instagram.com');
    if (source === 'X')
      return [
        'x.com',
        'www.x.com',
        'twitter.com',
        'www.twitter.com',
        'mobile.twitter.com',
      ].includes(host);
    return false;
  } catch {
    return false;
  }
}

export function readSocialImports(): HarvestItem[] {
  try {
    const stored = JSON.parse(accountStorage.getItem(SOCIAL_STORAGE) || '[]') as unknown;
    if (!Array.isArray(stored)) return [];
    return stored.filter((item): item is HarvestItem =>
      Boolean(
        item &&
        typeof item === 'object' &&
        (item as HarvestItem).section === 'social' &&
        typeof (item as HarvestItem).url === 'string',
      ),
    );
  } catch {
    return [];
  }
}

export default function SourceBoards({
  locale,
  interestLabels,
  localizedInterestLabels,
  preferences,
  initialPayload,
  onHarvested,
  onVideoFetchStart,
  onVideoFetchEnd,
  onSocialImport,
  t,
  onEditInterests,
}: Props) {
  const [active, setActive] = useState<FeedSection>('social');
  const [selectedSource, setSelectedSource] = useState<LiveSource | null>(null);
  const [payload, setPayload] = useState<HarvestPayload | null>(initialPayload ?? null);
  const [loadingSource, setLoadingSource] = useState<LiveSource | null>(null);
  const [loadError, setLoadError] = useState('');
  const [socialUrl, setSocialUrl] = useState('');
  const [socialImports, setSocialImports] = useState<HarvestItem[]>([]);
  const [socialBusy, setSocialBusy] = useState(false);
  const [socialError, setSocialError] = useState('');
  const { account } = useAccount();
  const localKeyConfiguration = Boolean(account);
  const [sourceApiKey, setSourceApiKey] = useState('');
  const [sourceKeyBusy, setSourceKeyBusy] = useState(false);
  const [sourceKeyError, setSourceKeyError] = useState('');
  const [jevFallbackOpen, setJevFallbackOpen] = useState(false);
  const [videoCursors, setVideoCursors] = useState<Partial<Record<LiveSource, string | null>>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const hasSearchInterests = interestLabels.some((label) => label.trim().length > 0);

  useEffect(() => {
    setPayload(initialPayload ?? null);
  }, [initialPayload]);

  useEffect(() => {

  }, []);

  const loadSource = async (source: LiveSource, refresh = false) => {
    if (source === 'YouTube' || source === 'Bilibili') onVideoFetchStart?.(source);
    setLoadingSource(source);
    setLoadError('');
    try {
      const params = new URLSearchParams();
      params.set('source', source);
      if (refresh) params.set('refresh', 'true');
      interestLabels.slice(0, 2).forEach((tag) => params.append('tag', tag));
      localizedInterestLabels.slice(0, 2).forEach((tag) => params.append('tagZh', tag));
      const response = await fetch(`/api/harvest?${params}`, {
        cache: 'no-store',
      });
      const incoming = await readApiData<HarvestPayload>(response);
      setPayload((current) => mergeHarvestPayload(current, incoming));
      if (
        source === 'Bilibili' &&
        incoming.health.some((item) => item.source === source && item.state === 'error')
      ) {
        setLoadError(
          incoming.warnings.some((warning) => warning.includes('HTTP 412'))
            ? t(
                'Bilibili 拒绝了站点的搜索请求，请稍后重试。',
                'Bilibili rejected this site’s search request. Try again later.',
              )
            : t('Bilibili 搜索失败，请重试。', 'Bilibili search failed. Try again.'),
        );
      }
      if (source === 'YouTube' || source === 'Bilibili')
        setVideoCursors((current) => ({ ...current, [source]: incoming.nextCursor ?? null }));
      onHarvested?.(incoming, false, source);
    } catch {
      setLoadError(
        t('来源暂时不可用，请重试。', 'This source is unavailable right now. Try again.'),
      );
    } finally {
      setLoadingSource(null);
      if (source === 'YouTube' || source === 'Bilibili') onVideoFetchEnd?.();
    }
  };

  const loadMoreVideos = async () => {
    const source = selectedSource;
    const cursor = source ? videoCursors[source] : null;
    if (!source || !cursor || loadingMoreRef.current || loadingSource) return;
    if (source === 'YouTube' || source === 'Bilibili') onVideoFetchStart?.(source);
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadError('');
    try {
      const params = new URLSearchParams({ source, cursor });
      interestLabels.slice(0, 2).forEach((tag) => params.append('tag', tag));
      localizedInterestLabels.slice(0, 2).forEach((tag) => params.append('tagZh', tag));
      const response = await fetch(`/api/harvest?${params}`, { cache: 'no-store' });
      const incoming = await readApiData<HarvestPayload>(response);
      if (incoming.health.some((item) => item.source === source && item.state === 'error'))
        throw new Error('Video search failed');
      setPayload((current) => appendHarvestPayload(current, incoming));
      setVideoCursors((current) => ({ ...current, [source]: incoming.nextCursor ?? null }));
      onHarvested?.(incoming, true, source);
    } catch {
      setLoadError(t('继续加载失败，请重试。', 'Could not load more videos. Try again.'));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
      onVideoFetchEnd?.();
    }
  };

  const selectSource = (source: LiveSource) => {
    setSelectedSource(source);
    setLoadError('');
    setSocialError('');
    setSourceApiKey('');
    setSourceKeyError('');
    if (source === 'Bilibili' && !hasSearchInterests) {
      onEditInterests();
      return;
    }
    if (!urlSources.has(source)) void loadSource(source);
  };

  useEffect(() => {
    setSocialImports(readSocialImports());
  }, []);

  const sectionItems =
    selectedSource === null
      ? []
      : [
          ...(payload?.sections[active] ?? []),
          ...(active === 'social' ? socialImports : []),
        ].filter((item) => item.source === selectedSource);
  const isVideoSource = selectedSource === 'YouTube' || selectedSource === 'Bilibili';
  const health = payload?.health.filter((item) => item.section === active) ?? [];
  const selectedHealth = health.find((item) => item.source === selectedSource);
  const keySource =
    selectedSource === 'YouTube' || selectedSource === 'Google Scholar' ? selectedSource : null;
  const isScholar = keySource === 'Google Scholar';
  const keyLabel = isScholar ? 'SerpApi key' : 'YouTube Data API key';
  const activeMeta = sectionMeta.find((section) => section.id === active) ?? sectionMeta[0];
  const crawlerNeedsAttention =
    active !== 'social' && (Boolean(loadError) || selectedHealth?.state === 'error');

  const configureSource = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!sourceApiKey.trim() || sourceKeyBusy || !keySource) return;
    const source = keySource;
    setSourceKeyBusy(true);
    setSourceKeyError('');
    try {
      const response = await fetch('/api/harvest', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ source, apiKey: sourceApiKey.trim() }),
      });
      await readApiData<{ configured: boolean }>(response);
      setSourceApiKey('');
      await loadSource(source, true);
    } catch {
      setSourceKeyError(
        t(
          '无法配置搜索，请检查 key 后重试。',
          'Could not configure search. Check the key and try again.',
        ),
      );
    } finally {
      setSourceKeyBusy(false);
    }
  };

  const clearSourceKey = async () => {
    if (sourceKeyBusy || !keySource) return;
    const source = keySource;
    setSourceKeyBusy(true);
    setSourceKeyError('');
    try {
      const response = await fetch('/api/harvest', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ source, apiKey: '' }),
      });
      await readApiData<{ configured: boolean }>(response);
      setSourceApiKey('');
      await loadSource(source, true);
    } catch {
      setSourceKeyError(
        t('无法清除本机 key，请重试。', 'Could not clear your account key. Try again.'),
      );
    } finally {
      setSourceKeyBusy(false);
    }
  };

  const importSocial = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!socialUrl.trim() || !selectedSource || !urlSources.has(selectedSource)) return;
    if (!urlMatchesSource(socialUrl.trim(), selectedSource)) {
      setSocialError(`Enter a public ${selectedSource} HTTPS post URL.`);
      return;
    }
    setSocialBusy(true);
    setSocialError('');
    try {
      const response = await fetch('/api/social/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: socialUrl.trim() }),
      });
      const result = await readApiData<{ item: HarvestItem }>(response);
      const next = [
        result.item,
        ...socialImports.filter((item) => item.url !== result.item?.url),
      ].slice(0, 30);
      setSocialImports(next);
      accountStorage.setItem(SOCIAL_STORAGE, JSON.stringify(next));
      onSocialImport?.(result.item);
      setSocialUrl('');
    } catch {
      setSocialError(
        t(
          '这条链接暂时无法导入，请确认它是公开帖子并重试。',
          'This link could not be imported. Check that it is public and try again.',
        ),
      );
    } finally {
      setSocialBusy(false);
    }
  };

  return (
    <div className="source-boards">
      <section
        className="source-section-grid"
        role="tablist"
        aria-label={t('内容板块', 'Content sections')}
      >
        {sectionMeta.map((section) => {
          const Icon = section.icon;
          const count = (
            section.id === 'social'
              ? (payload?.sections.social ?? []).filter((item) =>
                  sectionSources.social.includes(item.source),
                )
              : (payload?.sections[section.id] ?? [])
          ).filter((item) => matchesHarvestPreferences(item, preferences)).length;
          const sectionHealth = payload?.health.filter((item) => item.section === section.id) ?? [];
          const hasError = sectionHealth.some((item) => item.state === 'error');
          return (
            <button
              key={section.id}
              className={`source-section-card source-section-${section.id} ${active === section.id ? 'active' : ''}`}
              role="tab"
              aria-selected={active === section.id}
              aria-controls="source-board-panel"
              disabled={sourceKeyBusy}
              tabIndex={active === section.id ? 0 : -1}
              onClick={() => {
                setActive(section.id);
                setSelectedSource(null);
                setJevFallbackOpen(false);
                setSourceApiKey('');
                setSourceKeyError('');
              }}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const current = sectionMeta.findIndex((entry) => entry.id === section.id);
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? sectionMeta.length - 1
                      : (current + (event.key === 'ArrowRight' ? 1 : -1) + sectionMeta.length) %
                        sectionMeta.length;
                const target =
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                    '[role="tab"]',
                  )[next];
                target?.focus();
                target?.click();
              }}
            >
              <span className="section-card-top">
                <Icon size={20} />
                <strong>{t(section.zh, section.en)}</strong>
                <ArrowUpRight size={16} />
              </span>
              <span className="section-card-count">
                <b>{count}</b> {t('条候选', 'candidates')}
                <i className={hasError ? 'degraded' : ''} />
              </span>
            </button>
          );
        })}
      </section>

      <section className="source-board" id="source-board-panel" role="tabpanel">
        <header className="source-board-heading">
          <div>
            <span>{activeMeta.eyebrow}</span>
            <h2>{t(activeMeta.zh, activeMeta.en)}</h2>
          </div>
          {(active !== 'social' || (selectedSource && !urlSources.has(selectedSource))) && (
            <div className="source-board-actions">
              {active !== 'social' && (
                <button
                  className={`source-jev-fallback ${crawlerNeedsAttention ? 'needs-attention' : ''}`}
                  type="button"
                  aria-expanded={jevFallbackOpen}
                  aria-controls="jev-fallback-note"
                  onClick={() => setJevFallbackOpen((open) => !open)}
                >
                  <Sparkles size={13} />
                  <span>Jev scoring</span>
                  <small>{t('标题评分', 'title scores')}</small>
                </button>
              )}
              {selectedSource &&
                !urlSources.has(selectedSource) &&
                !(selectedSource === 'Bilibili' && !hasSearchInterests) && (
                  <>
                    <button
                      className="source-refresh"
                      type="button"
                      disabled={loadingSource !== null || sourceKeyBusy}
                      onClick={() => void loadSource(selectedSource, true)}
                    >
                      <RefreshCw size={15} className={loadingSource ? 'spinning' : ''} />
                      {loadingSource
                        ? t('正在刷新', 'Refreshing')
                        : t('刷新该来源', 'Refresh this source')}
                    </button>
                    {keySource &&
                      (!isScholar || localKeyConfiguration) &&
                      selectedHealth &&
                      selectedHealth.state !== 'configuration_required' && (
                        <button
                          className="source-refresh"
                          type="button"
                          disabled={loadingSource !== null || sourceKeyBusy}
                          onClick={() => void clearSourceKey()}
                        >
                          {t('清除本机 key', 'Clear account key')}
                        </button>
                      )}
                  </>
                )}
            </div>
          )}
        </header>

        <div className="source-health-row">
          {sectionSources[active].map((source) => {
            const item = health.find((entry) => entry.source === source);
            return (
              <button
                type="button"
                className={`source-health ${item ? `source-health-${item.state}` : 'source-health-idle'} ${selectedSource === source ? 'source-health-active' : ''}`}
                key={source}
                aria-pressed={selectedSource === source}
                disabled={loadingSource !== null || sourceKeyBusy}
                onClick={() => selectSource(source)}
              >
                <span className="health-mark">{sourceMark[source]}</span>
                <span className="source-health-copy">
                  <strong>{source}</strong>
                  <small>
                    {source === 'Bilibili' && !hasSearchInterests
                      ? t('先选择兴趣', 'Choose an interest first')
                      : item
                        ? healthText(item, locale)
                        : sourcePrompt[source]}
                  </small>
                  <span className="source-health-action">
                    {source === 'Bilibili' && !hasSearchInterests
                      ? t('选择兴趣', 'Choose interests')
                      : urlSources.has(source)
                        ? 'Import URL'
                        : 'Click to fetch'}
                  </span>
                </span>
                {loadingSource === source ? (
                  <LoaderCircle size={15} className="spinning" />
                ) : item && (item.state === 'live' || item.state === 'limited') ? (
                  <CheckCircle2 size={15} />
                ) : item ? (
                  <CircleAlert size={15} />
                ) : (
                  <ArrowUpRight size={15} />
                )}
              </button>
            );
          })}
        </div>

        {active !== 'social' && jevFallbackOpen && (
          <aside
            id="jev-fallback-note"
            className={`source-jev-note ${crawlerNeedsAttention ? 'needs-attention' : ''}`}
            aria-labelledby="jev-fallback-title"
          >
            <Sparkles size={16} />
            <div>
              <span>{t('评分状态', 'SCORING STATUS')}</span>
              <strong id="jev-fallback-title">
                {crawlerNeedsAttention
                  ? t('检测到采集异常', 'A crawler needs attention')
                  : t('Jev 正在为结果评分', 'Jev scores displayed results')}
              </strong>
              <p>
                {t(
                  '所有来源（包括 Bilibili 和 YouTube）都先按兴趣进行 Jev 评分，仅展示达到 Relevance 门槛且置信度合格的内容；评分失败的内容暂不展示。评分不代表观看过视频。',
                  'Jev scores all sources, including Bilibili and YouTube, against your interests. Only confident scores at or above Relevance are shown. Failed scores stay hidden. Scoring uses titles and does not watch videos.',
                )}
              </p>
            </div>
          </aside>
        )}

        {active === 'social' && selectedSource && urlSources.has(selectedSource) && (
          <div className="social-import-panel">
            <div className="social-import-copy">
              <span className="social-import-icon">
                <Share2 size={21} />
              </span>
              <div>
                <h3>{t('导入一条公开帖子', `Import one ${selectedSource} post`)}</h3>
              </div>
            </div>
            <form onSubmit={importSocial}>
              <label>
                <Share2 size={15} />
                <input
                  value={socialUrl}
                  onChange={(event) => setSocialUrl(event.target.value)}
                  placeholder={
                    selectedSource === 'TikTok'
                      ? 'https://www.tiktok.com/@creator/video/…'
                      : selectedSource === 'X'
                        ? 'https://x.com/creator/status/…'
                        : 'https://www.instagram.com/p/…'
                  }
                  aria-label={t('公开帖子链接', 'Public post URL')}
                />
              </label>
              <button disabled={socialBusy || !socialUrl.trim()}>
                {socialBusy ? (
                  <LoaderCircle size={15} className="spinning" />
                ) : (
                  <FileSearch size={15} />
                )}
                {t('解析并加入', 'Resolve & add')}
              </button>
            </form>
            {socialError && (
              <p className="social-import-error">
                <CircleAlert size={14} /> {socialError}
              </p>
            )}
            {selectedSource === 'Instagram' && (
              <p className="social-import-error">
                Instagram requires an official server connection.
              </p>
            )}
          </div>
        )}

        {keySource &&
          (selectedHealth?.state === 'configuration_required' ||
            (isScholar && selectedHealth?.state === 'error')) && (
            <div className="source-empty" aria-labelledby="source-key-prompt">
              <CircleAlert size={22} />
              <h3 id="source-key-prompt" role="status">
                {selectedHealth.state === 'configuration_required'
                  ? isScholar && !localKeyConfiguration
                    ? t('Google Scholar 尚未连接', 'Google Scholar is not connected yet')
                    : t(`请先填写 ${keyLabel}`, `Enter your ${keyLabel} to continue`)
                  : healthText(selectedHealth, locale)}
              </h3>
              {isScholar && selectedHealth.state === 'error' && (
                <p>{payload?.warnings.find((warning) => warning.startsWith('Google Scholar:'))}</p>
              )}
              {isScholar && !localKeyConfiguration ? (
                <p>
                  {t(
                    '站点所有者可使用 SerpApi key 连接此来源。',
                    'Sign in to connect this source with your own SerpApi key.',
                  )}
                </p>
              ) : (
                <form className="source-key-form" onSubmit={configureSource}>
                  <label htmlFor="source-search-api-key">{keyLabel}</label>
                  <div>
                    <input
                      id="source-search-api-key"
                      type="password"
                      required
                      minLength={20}
                      maxLength={256}
                      pattern="[A-Za-z0-9_-]{20,256}"
                      aria-describedby="source-key-prompt"
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      value={sourceApiKey}
                      onChange={(event) => {
                        setSourceApiKey(event.target.value);
                        setSourceKeyError('');
                      }}
                      placeholder={t('粘贴 API key', 'Paste API key')}
                      disabled={sourceKeyBusy}
                    />
                    <button type="submit" disabled={sourceKeyBusy || !sourceApiKey.trim()}>
                      {sourceKeyBusy
                        ? t('连接中', 'Connecting')
                        : interestLabels.length
                          ? t('保存并搜索', 'Save & search')
                          : t('保存 key', 'Save key')}
                    </button>
                  </div>
                  <p>
                    {isScholar
                      ? t(
                          '通过 SerpApi 搜索 Google Scholar；key 仅在本机内存保存，搜索时发送给 SerpApi。',
                          'Your key is encrypted in your account and sent to SerpApi only for searches.',
                        )
                      : t(
                          '只存于本机服务内存；搜索时会发送给 Google 官方 API，重启后失效。',
                          'Your key is encrypted in your account and sent to the official Google API only for searches.',
                        )}
                  </p>
                  <a
                    href={
                      isScholar
                        ? 'https://serpapi.com/manage-api-key'
                        : 'https://developers.google.com/youtube/v3/getting-started'
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('如何获取 API key', 'How to get an API key')}
                  </a>
                  {sourceKeyError && (
                    <p className="source-key-error" role="alert">
                      {sourceKeyError}
                    </p>
                  )}
                </form>
              )}
            </div>
          )}

        {selectedSource === 'Google Scholar' && (
          <div className="source-empty">
            <p>
              {t(
                '免费替代：Semantic Scholar 和 Crossref，无需 SerpApi key。Google Scholar 仅在手动选择时使用付费提供商配额。',
                'Free alternatives: Semantic Scholar and Crossref need no SerpApi key. Google Scholar only uses provider quota when selected explicitly.',
              )}
            </p>
            <button
              type="button"
              disabled={loadingSource !== null || sourceKeyBusy}
              onClick={() => selectSource('Semantic Scholar')}
            >
              {t('使用免费论文搜索', 'Use free paper search')}
            </button>
          </div>
        )}

        {(selectedSource === 'Semantic Scholar' || selectedSource === 'Crossref') && (
          <div className="source-empty">
            <p>
              {t(
                '免费检索论文元数据，无需账号或 API key；全文能否免费阅读由原出版方决定。',
                'Search paper metadata for free without an account or API key. Full-text access depends on the publisher.',
              )}
            </p>
            {selectedHealth?.state === 'error' && (
              <p role="alert">
                {payload?.warnings.find((warning) => warning.startsWith(`${selectedSource}:`))}
              </p>
            )}
          </div>
        )}

        {selectedSource &&
          ['Google Scholar', 'Semantic Scholar', 'Crossref'].includes(selectedSource) &&
          !loadingSource &&
          !hasSearchInterests && (
            <div className="source-empty">
              <p>{t('选择兴趣后搜索论文', 'Choose interests to search for papers')}</p>
              <button type="button" onClick={onEditInterests}>
                {t('选择兴趣', 'Choose interests')}
              </button>
            </div>
          )}

        <div className="source-board-toolbar">
          <span>{t('内容统一显示在「For you」', 'Browse results in For you')}</span>
          <span>
            <Clock3 size={13} />
            {selectedSource && payload?.health.some((item) => item.source === selectedSource)
              ? t(
                  `更新于 ${new Date(payload.generatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
                  `Updated ${new Date(payload.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
                )
              : t('等待首次采集', 'Waiting for first harvest')}
          </span>
        </div>

        {loadingSource && (
          <div className="source-loading" role="status">
            <LoaderCircle className="spinning" />
            <strong>{t('正在采集', `Fetching ${loadingSource}`)}</strong>
          </div>
        )}
        {loadError && (
          <div className="source-empty source-error-state" role="alert">
            <CircleAlert size={22} />
            <p>{loadError}</p>
            {selectedSource && !urlSources.has(selectedSource) && (
              <button onClick={() => void loadSource(selectedSource, true)}>
                {t('重新尝试', 'Try again')}
              </button>
            )}
          </div>
        )}

        {isVideoSource &&
          !onVideoFetchStart &&
          (sectionItems.length > 0 || videoCursors[selectedSource!]) && (
            <div className="video-load-footer" aria-live="polite">
              {loadingMore ? (
                <span>{t('正在继续搜索视频…', 'Searching for more videos…')}</span>
              ) : videoCursors[selectedSource!] ? (
                <button
                  type="button"
                  disabled={loadingSource !== null}
                  onClick={() => void loadMoreVideos()}
                >
                  {loadError
                    ? t('重试加载更多', 'Retry loading more')
                    : t('加载更多视频', 'Load more videos')}
                </button>
              ) : (
                <span>{t('已获取全部搜索结果', 'All search results fetched')}</span>
              )}
            </div>
          )}

        {payload?.warnings.length ? (
          <details className="source-warnings">
            <summary>
              <CircleAlert size={13} />{' '}
              {t(
                `${payload.warnings.length} 条采集警告`,
                `${payload.warnings.length} source warnings`,
              )}
            </summary>
            {payload.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </details>
        ) : null}

        <footer className="source-board-footer">
          <span>
            <Newspaper size={14} />
            {t('公开来源', 'Public sources')}
          </span>
          <span>{t('不改变原生推荐', 'No native feed changes')}</span>
        </footer>
      </section>
    </div>
  );
}
