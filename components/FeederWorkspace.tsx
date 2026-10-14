'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  ArrowUpRight,
  Bookmark,
  ChevronDown,
  Compass,
  Layers3,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { HarvestItem, HarvestPayload } from '@/lib/crawler/types';
import type { Locale } from '@/lib/locale';
import { readApiData } from '@/lib/api-contract';
import { bilingualInterestLabel, domains, searchInterests, type Preferences } from '@/lib/feed';
import {
  matchedHarvestTagIds,
  rankHarvestCandidates,
  type FeederEvent,
  type FeederSignal,
} from '@/lib/feeder';
import { resourceUrlKey, type ResourceRecord } from '@/lib/resources';
import { appendHarvestPayload, mergeHarvestPayload } from '@/lib/crawler/merge';
import { feedRatingContext, simulateFeed, type JevRating } from '@/lib/feed-simulator';
import type { TagSuggestion } from '@/lib/tag-suggestions';
import SourceBoards, { readSocialImports } from './SourceBoards';
import YouTubeVideo from './YouTubeVideo';
import BilibiliVideo from './BilibiliVideo';
import InterestIntro, { InterestIntroTarget } from './InterestIntro';
import styles from './FeederWorkspace.module.css';

type WorkspacePage = 'discover' | 'garden';
type VideoSource = 'YouTube' | 'Bilibili';
type VideoPage = { cursor: string | null; tags: string[]; localizedTags: string[] };
type Props = {
  page: WorkspacePage;
  locale: Locale;
  preferences: Preferences;
  resources: ResourceRecord[];
  events: FeederEvent[];
  onSaveResource: (item: HarvestItem) => void;
  onRecordEvent: (event: FeederEvent) => void;
  onUndoEvent: (id: string) => void;
  onTargetJevAverageChange: (value: number) => void;
  onOnlySelectedTagsChange: (value: boolean) => void;
  onInterestRuleChange: (
    rule: 'requireAllSelectedTags' | 'excludeUnselectedTags',
    value: boolean,
  ) => void;
  onEditInterests: () => void;
  guideStep: number;
  onGuideAdvance: (step: number) => void;
};

const catalog = domains.flatMap((domain) =>
  domain.tags.map((tag) => ({ ...tag, domainId: domain.id })),
);
const broadGithubTopics = ['ai', 'c', 'java', 'javascript', 'python', 'rust', 'typescript'];
const t = (zh: string, en: string, locale: Locale) => (locale === 'zh' ? zh : en);

function HelpHint({ title, children }: { title: string; children: ReactNode }) {
  const tooltipId = useId();
  return (
    <span className={styles.helpHint}>
      <button
        type="button"
        className={styles.helpIcon}
        aria-label={`About ${title}`}
        aria-describedby={tooltipId}
      >
        ?
      </button>
      <span id={tooltipId} role="tooltip" className={styles.helpText}>
        {children}
      </span>
    </span>
  );
}

export default function FeederWorkspace({
  page,
  locale,
  preferences,
  resources,
  events,
  onSaveResource,
  onRecordEvent,
  onUndoEvent,
  onTargetJevAverageChange,
  onOnlySelectedTagsChange,
  onInterestRuleChange,
  onEditInterests,
  guideStep,
  onGuideAdvance,
}: Props) {
  const [payload, setPayload] = useState<HarvestPayload | null>(null);
  const [socialImports, setSocialImports] = useState<HarvestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [interestsDetailsOpen, setInterestsDetailsOpen] = useState(false);
  const [relevanceDetailsOpen, setRelevanceDetailsOpen] = useState(false);
  const interestsDetailsId = useId();
  const relevanceDetailsId = useId();
  const [videoFetchStarted, setVideoFetchStarted] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [compactPanel, setCompactPanel] = useState<'forYou' | 'sources' | null>(null);
  const [videoPages, setVideoPages] = useState<Partial<Record<VideoSource, VideoPage>>>({});
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sourceVideoLoading, setSourceVideoLoading] = useState(false);
  const [olderError, setOlderError] = useState('');
  const olderLoadingRef = useRef(false);
  const nextVideoSourceRef = useRef(0);
  const loadSentinelRef = useRef<HTMLDivElement>(null);
  const sentinelVisibleRef = useRef(false);
  const scrollIgnoreUntilRef = useRef(0);
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchTag, setSearchTag] = useState('');
  const [displayCount, setDisplayCount] = useState(20);
  const [videoColumns, setVideoColumns] = useState<'auto' | '1' | '2' | '3' | '4'>('auto');
  const [ratingRevision, setRatingRevision] = useState(0);
  const [scoring, setScoring] = useState(false);
  const [scoringError, setScoringError] = useState('');
  const [scoringDone, setScoringDone] = useState(false);
  const [nearbyTopics, setNearbyTopics] = useState<TagSuggestion[]>([]);
  const [nearbyStatus, setNearbyStatus] = useState<
    'idle' | 'loading' | 'live' | 'curated' | 'unavailable'
  >('idle');
  const [nearbyUpdatedAt, setNearbyUpdatedAt] = useState<string | null>(null);
  const [nearbyRefresh, setNearbyRefresh] = useState(0);
  const ratingsRef = useRef(new Map<string, JevRating>());
  const ratedTitlesRef = useRef(new Map<string, string>());
  const ratingContextRef = useRef('');
  const interests = searchInterests(preferences);
  const nearbyQuery = JSON.stringify({
    domainIds: preferences.domains,
    tagIds: preferences.tags,
    customTerms: preferences.customTags.map((tag) => tag.labelEn),
    excludeTerms: [
      ...preferences.tags,
      ...preferences.blockedTags,
      ...catalog
        .filter((tag) => preferences.blockedTags.includes(tag.id))
        .flatMap((tag) => [tag.labelEn, tag.label]),
      ...broadGithubTopics,
    ],
    readingLanguage: preferences.readingLanguage,
    fresh: true,
  });

  useEffect(() => {
    if (page !== 'garden') return;
    const query = JSON.parse(nearbyQuery) as {
      domainIds: string[];
      tagIds: string[];
      customTerms: string[];
    };
    if (!query.domainIds.length && !query.tagIds.length && !query.customTerms.length) {
      setNearbyTopics([]);
      setNearbyUpdatedAt(null);
      setNearbyStatus('idle');
      return;
    }
    const controller = new AbortController();
    setNearbyTopics([]);
    setNearbyUpdatedAt(null);
    setNearbyStatus('loading');
    async function loadNearbyTopics() {
      try {
        const response = await fetch('/api/tags/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: nearbyQuery,
          cache: 'no-store',
          signal: controller.signal,
        });
        const result = await readApiData<{
          suggestions: TagSuggestion[];
          liveStatus: 'live' | 'degraded' | 'idle';
          retrievedAt: string | null;
        }>(response);
        if (controller.signal.aborted) return;
        setNearbyTopics(result.suggestions);
        setNearbyUpdatedAt(result.liveStatus === 'live' ? result.retrievedAt : null);
        setNearbyStatus(
          result.suggestions.length
            ? result.suggestions.some((suggestion) => suggestion.origin === 'live')
              ? 'live'
              : 'curated'
            : 'unavailable',
        );
      } catch {
        if (controller.signal.aborted) return;
        setNearbyTopics([]);
        setNearbyUpdatedAt(null);
        setNearbyStatus('unavailable');
      }
    }
    void loadNearbyTopics();
    return () => controller.abort();
  }, [page, nearbyQuery, nearbyRefresh]);

  async function refresh(
    force = false,
    options: { search?: string | null; completeGuide?: boolean } = {},
  ) {
    setVideoFetchStarted(true);
    setIsCompact(false);
    setCompactPanel(null);
    setVideoPages({});
    setOlderError('');
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (force) params.set('refresh', 'true');
      const activeSearch = options.search !== undefined ? (options.search ?? '') : searchTag;
      const tags = activeSearch
        ? [activeSearch.slice(0, 80)]
        : interests.slice(0, 2).map((interest) => interest.labelEn);
      const localizedTags = activeSearch
        ? []
        : interests.slice(0, 2).map((interest) => interest.labelZh);
      tags.forEach((tag) => params.append('tag', tag));
      localizedTags.forEach((tag) => params.append('tagZh', tag));
      const response = await fetch(`/api/harvest?${params}`, {
        cache: 'no-store',
      });
      const incoming = await readApiData<HarvestPayload>(response);
      setPayload(incoming);
      if (options.completeGuide) onGuideAdvance(5);
      setVideoPages(
        Object.fromEntries(
          (['YouTube', 'Bilibili'] as const)
            .filter((source) => incoming.nextCursors?.[source])
            .map((source) => [
              source,
              { cursor: incoming.nextCursors?.[source] ?? null, tags, localizedTags },
            ]),
        ),
      );
      setSocialImports(readSocialImports());
    } catch {
      setError('Public sources could not be loaded. Try again.');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = searchInput.trim().slice(0, 80);
    if (!trimmed) return;
    setSearchTag(trimmed);
    setPayload(null);
    setLoaded(false);
    setDisplayCount(20);
    setQuery('');
    ratingsRef.current.clear();
    ratedTitlesRef.current.clear();
    ratingContextRef.current = '';
    void refresh(true, { search: trimmed });
  }

  function clearSearch() {
    if (!searchTag && !searchInput) return;
    setSearchTag('');
    setSearchInput('');
    setPayload(null);
    setLoaded(false);
    setVideoPages({});
    setDisplayCount(20);
    ratingsRef.current.clear();
    ratedTitlesRef.current.clear();
    ratingContextRef.current = '';
  }

  useEffect(() => {
    setSocialImports(readSocialImports());
  }, []);

  const savedKeys = useMemo(
    () => new Set(resources.map((item) => resourceUrlKey(item.url))),
    [resources],
  );
  // Relevance is applied after scoring; it does not change the candidate pool.
  // While a search is active, tag-based preference filters are relaxed so the
  // ad-hoc search text drives the pool without ever being written back to
  // preferences. Blocked sources and blocked tags still apply.
  const candidatePreferences = useMemo(
    () =>
      searchTag
        ? {
            ...preferences,
            tags: [],
            domains: [],
            customTags: [],
            relatedDomains: [],
            onlySelectedTags: false,
            requireAllSelectedTags: false,
            excludeUnselectedTags: false,
          }
        : preferences,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      searchTag,
      preferences.tags,
      preferences.domains,
      preferences.customTags,
      preferences.tagJev,
      preferences.blockedTags,
      preferences.blockedSources,
      preferences.onlySelectedTags,
      preferences.requireAllSelectedTags,
      preferences.excludeUnselectedTags,
      preferences.relatedDomains,
      preferences.exploration,
    ],
  );
  const candidates = useMemo(
    () =>
      rankHarvestCandidates(
        [
          ...(payload?.sections.social ?? []),
          ...(payload?.sections.academic ?? []),
          ...(payload?.sections.opensource ?? []),
          ...socialImports.filter((item) => !['TikTok', 'Instagram', 'X'].includes(item.source)),
        ].filter(
          (item) => !videoFetchStarted || item.source === 'YouTube' || item.source === 'Bilibili',
        ),
        candidatePreferences,
        events,
        { limit: 300, pool: true },
      ),
    [payload, socialImports, candidatePreferences, events, videoFetchStarted],
  );
  const publicCandidateCount =
    (payload?.sections.social ?? []).length +
    (payload?.sections.academic ?? []).length +
    (payload?.sections.opensource ?? []).length +
    socialImports.filter((item) => !['TikTok', 'Instagram', 'X'].includes(item.source)).length;
  const targetAverage = preferences.targetJevAverage ?? 8;
  const goalTags = useMemo(
    () =>
      searchTag
        ? [searchTag.slice(0, 80)]
        : searchInterests(preferences)
            .map((interest) => bilingualInterestLabel(interest.labelEn, interest.labelZh))
            .slice(0, 12),
    [preferences, searchTag],
  );
  const goalKey = goalTags.join('\u0000');
  const ratingContext = feedRatingContext(candidates, goalKey);
  const simulation = useMemo(
    () => simulateFeed(candidates, ratingsRef.current, targetAverage, candidates.length),
    // ratingRevision signals mutations to the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, targetAverage, ratingRevision],
  );
  useEffect(() => {
    if (!loaded || page !== 'discover' || !candidates.length || !goalTags.length) return;
    if (ratingContextRef.current !== goalKey) {
      ratingsRef.current.clear();
      ratedTitlesRef.current.clear();
      ratingContextRef.current = goalKey;
      setRatingRevision((value) => value + 1);
    }
    for (const candidate of candidates) {
      const scoredTitle = ratedTitlesRef.current.get(candidate.key);
      if (scoredTitle !== undefined && scoredTitle !== candidate.item.title) {
        ratingsRef.current.delete(candidate.key);
        ratedTitlesRef.current.delete(candidate.key);
      }
    }
    let cancelled = false;
    const controller = new AbortController();
    setScoring(true);
    setScoringDone(false);
    setScoringError('');
    const ordered = candidates.flatMap((_, index) => {
      if (index >= Math.ceil(candidates.length / 2)) return [];
      const opposite = candidates[candidates.length - 1 - index];
      return opposite && opposite !== candidates[index]
        ? [candidates[index], opposite]
        : [candidates[index]];
    });
    async function run() {
      let failures = 0;
      for (let offset = 0; offset < ordered.length && !cancelled; offset += 4) {
        const batch = ordered
          .slice(offset, offset + 4)
          .filter((candidate) => !ratingsRef.current.has(candidate.key));
        const results = await Promise.all(
          batch.map(async (candidate) => {
            try {
              const response = await fetch('/api/agent/v1/decisions/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  platform: 'feeder',
                  contentTitle: candidate.item.title,
                  goalTags,
                  remainingVideoBudget: 1,
                  remainingMinuteBudget: 1,
                  provider: 'jev',
                }),
                signal: controller.signal,
              });
              if (response.status === 503) {
                setScoringError('Jev is not configured on this server.');
                controller.abort();
                return null;
              }
              const data = await readApiData<{
                decision: {
                  relevanceScore: number | null;
                  confidence: number | null;
                  provider: string;
                  model?: string;
                };
              }>(response);
              const decision = data.decision;
              if (
                decision.provider !== 'jev' ||
                decision.relevanceScore === null ||
                decision.confidence === null
              )
                throw new Error('Jev score unavailable');
              return {
                key: candidate.key,
                title: candidate.item.title,
                rating: {
                  score: decision.relevanceScore,
                  confidence: decision.confidence,
                  model: decision.model,
                },
              };
            } catch {
              if (controller.signal.aborted) return null;
              failures += 1;
              return null;
            }
          }),
        );
        if (cancelled || controller.signal.aborted) break;
        for (const result of results) {
          if (!result) continue;
          ratingsRef.current.set(result.key, result.rating);
          ratedTitlesRef.current.set(result.key, result.title);
        }
        setRatingRevision((value) => value + 1);
      }
      if (!cancelled) {
        setScoring(false);
        setScoringDone(true);
        if (failures && !controller.signal.aborted)
          setScoringError(`${failures} candidates could not be scored by Jev.`);
      }
    }
    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // goalKey represents the selected tags and candidates represents the current eligible pool.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, page, ratingContext, targetAverage]);
  const visible = useMemo(() => {
    const needles = [query.trim().toLowerCase(), searchTag.trim().toLowerCase()].filter(Boolean);
    const items = videoFetchStarted
      ? [...simulation.items].sort((a, b) =>
          (b.candidate.item.publishedAt ?? '').localeCompare(a.candidate.item.publishedAt ?? ''),
        )
      : simulation.items;
    if (!needles.length) return items;
    return items.filter(({ candidate }) => {
      const haystack = [
        candidate.item.title,
        candidate.item.summary,
        candidate.item.author,
        candidate.item.source,
        candidate.item.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return needles.every((needle) => haystack.includes(needle));
    });
  }, [simulation, query, searchTag, videoFetchStarted]);
  const shown = visible.slice(0, displayCount);
  const hasOlderPages = Object.values(videoPages).some((page) => Boolean(page?.cursor));
  const loadOlderVideos = useCallback(async () => {
    if (olderLoadingRef.current) return;
    const available = (['Bilibili', 'YouTube'] as const).filter(
      (source) => videoPages[source]?.cursor,
    );
    if (!available.length) return;
    const source = available[nextVideoSourceRef.current % available.length];
    nextVideoSourceRef.current += 1;
    const page = videoPages[source];
    if (!page?.cursor) return;
    olderLoadingRef.current = true;
    setLoadingOlder(true);
    setOlderError('');
    try {
      const params = new URLSearchParams({ source, cursor: page.cursor });
      page.tags.forEach((tag) => params.append('tag', tag));
      page.localizedTags.forEach((tag) => params.append('tagZh', tag));
      const response = await fetch(`/api/harvest?${params}`, { cache: 'no-store' });
      const incoming = await readApiData<HarvestPayload>(response);
      if (incoming.health.some((entry) => entry.source === source && entry.state === 'error'))
        throw new Error('Video search failed');
      setPayload((current) => appendHarvestPayload(current, incoming));
      setVideoPages((current) => ({
        ...current,
        [source]: { ...page, cursor: incoming.nextCursor ?? null },
      }));
    } catch {
      setOlderError('Could not load older videos. Try again.');
    } finally {
      olderLoadingRef.current = false;
      setLoadingOlder(false);
    }
  }, [videoPages]);
  useEffect(() => {
    const target = loadSentinelRef.current;
    if (
      !videoFetchStarted ||
      !target ||
      !hasOlderPages ||
      olderError ||
      sourceVideoLoading ||
      loading
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          sentinelVisibleRef.current = false;
          return;
        }
        if (sentinelVisibleRef.current || olderLoadingRef.current) return;
        sentinelVisibleRef.current = true;
        if (visible.length > displayCount) setDisplayCount((count) => count + 20);
        else void loadOlderVideos();
      },
      { rootMargin: '0px 0px 280px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [
    videoFetchStarted,
    hasOlderPages,
    olderError,
    sourceVideoLoading,
    loading,
    visible.length,
    displayCount,
    loadOlderVideos,
  ]);
  useEffect(() => {
    if (page !== 'discover' || !videoFetchStarted) return;
    const mobile = window.matchMedia(
      '(max-width: 760px), (max-width: 960px) and (hover: none) and (pointer: coarse)',
    );
    const onLayoutChange = () => {
      if (mobile.matches) {
        setIsCompact(false);
        setCompactPanel(null);
      }
    };
    onLayoutChange();
    mobile.addEventListener('change', onLayoutChange);
    let previousY = window.scrollY;
    let downwardDistance = 0;
    let upwardDistance = 0;
    const onScroll = () => {
      if (mobile.matches) return;
      const currentY = window.scrollY;
      const delta = currentY - previousY;
      previousY = currentY;
      if (currentY < 24) {
        downwardDistance = 0;
        upwardDistance = 0;
        setIsCompact(false);
        return;
      }
      if (performance.now() < scrollIgnoreUntilRef.current || Math.abs(delta) < 2) return;
      if (delta > 0) {
        downwardDistance += delta;
        upwardDistance = 0;
        if (!isCompact && currentY > 120 && downwardDistance >= 48) {
          downwardDistance = 0;
          scrollIgnoreUntilRef.current = performance.now() + 260;
          setCompactPanel(null);
          setIsCompact(true);
        }
      } else {
        upwardDistance -= delta;
        downwardDistance = 0;
        if (isCompact && upwardDistance >= 40) {
          upwardDistance = 0;
          scrollIgnoreUntilRef.current = performance.now() + 260;
          setCompactPanel(null);
          setIsCompact(false);
        }
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      mobile.removeEventListener('change', onLayoutChange);
    };
  }, [page, videoFetchStarted, isCompact]);
  const dismissed = events
    .filter((event) => event.signal === 'hide' || event.signal === 'not_interested')
    .slice(-5)
    .reverse();
  const scoringState = scoring
    ? 'Scoring'
    : !loaded
      ? 'Fetch candidates'
      : candidates.length === 0
        ? 'No candidates'
        : simulation.targetMet
          ? 'Target reached'
          : scoringError && simulation.ratedCount === 0
            ? 'Jev unavailable'
            : scoringDone
              ? 'Target not reached'
              : 'Waiting for scores';
  const ratedPercent = candidates.length
    ? Math.round((simulation.ratedCount / candidates.length) * 100)
    : 0;
  const selectedTags = catalog.filter((tag) => preferences.tags.includes(tag.id));
  const showSources = sourcesExpanded || isCompact;
  const refreshLabel = loading
    ? 'Fetching…'
    : searchTag
      ? 'Refresh search'
      : loaded
        ? 'Refresh sources'
        : 'Fetch public sources';
  const openForYou = () => {
    if (isCompact) {
      setCompactPanel((current) => (current === 'forYou' ? null : 'forYou'));
    } else {
      setSourcesExpanded(false);
    }
  };
  const openSources = () => {
    if (isCompact) {
      setCompactPanel((current) => (current === 'sources' ? null : 'sources'));
    } else {
      setSourcesExpanded((current) => !current);
    }
  };
  function record(item: HarvestItem, signal: FeederSignal): FeederEvent {
    const event: FeederEvent = {
      id: crypto.randomUUID(),
      actor: 'user',
      itemKey: resourceUrlKey(item.url),
      signal,
      tagIds: matchedHarvestTagIds(item).slice(0, 12),
      source: item.source,
      author: item.author,
      at: new Date().toISOString(),
    };
    onRecordEvent(event);
    return event;
  }

  function save(item: HarvestItem) {
    if (savedKeys.has(resourceUrlKey(item.url))) return;
    onSaveResource(item);
    record(item, 'save');
  }

  if (page === 'garden') {
    return (
      <div className={styles.workspace}>
        <header className={styles.header}>
          <span className={styles.eyebrow}>YOUR INTERESTS</span>
          <h1>My garden</h1>
          <p>Choose your topics and adjust Relevance in Discover to shape your feed.</p>
          <button className={styles.secondary} onClick={onEditInterests}>
            <SlidersHorizontal size={16} /> Manage interests in Discover
          </button>
        </header>
        <div className={styles.twoColumns}>
          <section className={styles.panel}>
            <div className={styles.headingWithHelp}>
              <h2>Nearby topics</h2>
              <HelpHint title="Nearby topics">
                Generated from current public information related to your interests. Explicit topic
                exclusions still apply to your feed.
              </HelpHint>
              <button
                type="button"
                className={styles.nearbyRefresh}
                onClick={() => setNearbyRefresh((value) => value + 1)}
                disabled={nearbyStatus === 'loading' || nearbyStatus === 'idle'}
                aria-label="Refresh nearby topics"
              >
                <RotateCcw size={15} /> Refresh
              </button>
            </div>
            <div className={styles.nearbyChips} aria-live="polite">
              {nearbyTopics.map((topic) => (
                <span key={topic.id}>{topic.displayLabel}</span>
              ))}
            </div>
            {nearbyStatus === 'idle' && <p>Choose an interest to find nearby topics online.</p>}
            {nearbyStatus === 'loading' && <p>Finding nearby topics…</p>}
            {nearbyStatus === 'curated' && <p>Related topics from the built-in catalog.</p>}
            {nearbyStatus === 'unavailable' && (
              <p>Live nearby topics are unavailable. Try refreshing.</p>
            )}
            {nearbyStatus === 'live' && !nearbyTopics.length && (
              <p>No nearby topics found in the current public results.</p>
            )}
            {nearbyUpdatedAt && nearbyTopics.length > 0 && (
              <p className={styles.nearbyChecked}>
                Updated {new Date(nearbyUpdatedAt).toLocaleString()}
              </p>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.workspace} ${showSources ? styles.workspaceExpanded : ''} ${videoFetchStarted ? styles.workspaceVideoActive : ''} ${isCompact ? styles.workspaceVideoMode : ''}`}
    >
      <header className={styles.header}>
        <span className={styles.eyebrow}>YOUR OWN DISCOVERY LAYER</span>
        <h1>Discover</h1>
        <div className={styles.toolbar}>
          <div
            className={styles.tabs}
            role={isCompact ? 'group' : 'tablist'}
            aria-label="Discover view"
          >
            <button
              aria-selected={isCompact ? undefined : !sourcesExpanded}
              aria-pressed={isCompact ? compactPanel === 'forYou' : undefined}
              role={isCompact ? undefined : 'tab'}
              aria-label="For you"
              title="For you"
              onClick={openForYou}
            >
              <Compass size={18} aria-hidden="true" />
              <span className={styles.tabLabel}>For you</span>
            </button>
            <button
              aria-selected={isCompact ? undefined : sourcesExpanded}
              aria-pressed={isCompact ? compactPanel === 'sources' : undefined}
              aria-expanded={isCompact ? compactPanel === 'sources' : sourcesExpanded}
              role={isCompact ? undefined : 'tab'}
              aria-label="Sources"
              title="Sources"
              onClick={openSources}
            >
              <Layers3 size={18} aria-hidden="true" />
              <span className={styles.tabLabel}>Sources</span>
            </button>
          </div>
          <form
            className={styles.searchForm}
            role="search"
            aria-label="Search public sources"
            onSubmit={submitSearch}
          >
            <label className={styles.searchField}>
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                enterKeyHint="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search public sources"
                aria-label="Search public sources by tag"
                maxLength={80}
              />
              {searchTag && (
                <button
                  type="button"
                  className={styles.searchClear}
                  onClick={clearSearch}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </label>
            <button
              type="submit"
              className={styles.secondary}
              disabled={loading || !searchInput.trim()}
            >
              <Search size={15} aria-hidden="true" /> Search
            </button>
          </form>
          <InterestIntroTarget
            active={guideStep === 5}
            step={6}
            instruction={
              loading
                ? 'Loading your sources… Setup finishes when the request succeeds.'
                : `Click ${refreshLabel} to load your selected sources and finish setup.`
            }
            className={styles.guideRefresh}
          >
            <button
              className={`${styles.secondary} ${styles.refreshButton}`}
              onClick={() => void refresh(true, { completeGuide: true })}
              disabled={loading}
              aria-label={refreshLabel}
              title={refreshLabel}
            >
              <RotateCcw size={18} aria-hidden="true" />
              <span className={styles.actionLabel}>{refreshLabel}</span>
            </button>
          </InterestIntroTarget>
        </div>
        {searchTag && (
          <div className={styles.searchBanner} role="status">
            <span>
              Searching public sources for <strong>{searchTag}</strong>. This search is not saved to
              your interests.
            </span>
            <button type="button" className={styles.secondary} onClick={clearSearch}>
              <X size={14} /> Clear search
            </button>
          </div>
        )}
      </header>
      <div className={showSources ? styles.discoverSplit : undefined}>
        <div className={showSources ? styles.discoverMain : undefined}>
          <div className={styles.discoverSettings} data-open={compactPanel === 'forYou'}>
            <InterestIntro className={styles.interestsPanel}>
              <div className={styles.interestsHeading}>
                <div>
                  <span className={styles.eyebrow}>MY INTERESTS</span>
                  <h2>Your interests</h2>
                </div>
                <InterestIntroTarget
                  active={guideStep === 0}
                  step={1}
                  instruction="Click Expand to open your interest settings."
                >
                  <button
                    type="button"
                    className={styles.expandButton}
                    aria-expanded={interestsDetailsOpen}
                    aria-controls={interestsDetailsId}
                    onClick={() => {
                      if (!interestsDetailsOpen) onGuideAdvance(0);
                      setInterestsDetailsOpen((open) => !open);
                    }}
                  >
                    <ChevronDown size={16} aria-hidden="true" />
                    {interestsDetailsOpen ? 'Collapse' : 'Expand'}
                  </button>
                </InterestIntroTarget>
              </div>
              <div
                id={interestsDetailsId}
                className={styles.cardDetails}
                hidden={!interestsDetailsOpen}
              >
                <div className={styles.manageInterestsRow}>
                  <InterestIntroTarget
                    active={guideStep === 1}
                    step={2}
                    instruction="Click Manage interests to choose what you want to see."
                  >
                    <button
                      className={styles.secondary}
                      onClick={() => {
                        onGuideAdvance(1);
                        onEditInterests();
                      }}
                    >
                      <SlidersHorizontal size={16} /> Manage interests
                    </button>
                  </InterestIntroTarget>
                </div>
                <div className={styles.domainList}>
                  {domains
                    .filter((domain) => preferences.domains.includes(domain.id))
                    .map((domain, index) => (
                      <span key={domain.id}>
                        <i
                          className={styles.domainDot}
                          style={{
                            backgroundColor: ['#a6b48a', '#dfbd91', '#aec0cb', '#aa9ab7'][
                              index % 4
                            ],
                          }}
                        />
                        {domain.labelEn}
                      </span>
                    ))}
                </div>
                <div className={styles.chips}>
                  {selectedTags.map((tag) => (
                    <span key={tag.id}>{tag.labelEn}</span>
                  ))}
                  {preferences.customTags.map((tag) => (
                    <span key={tag.id}>{tag.labelEn}</span>
                  ))}
                  {!selectedTags.length &&
                    !preferences.customTags.length &&
                    preferences.domains.length > 0 && (
                      <span>Using selected areas until you add specific tags</span>
                    )}
                </div>
                <fieldset className={styles.matchRules}>
                  <legend>Content matching</legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={preferences.onlySelectedTags === true}
                      onChange={(event) => onOnlySelectedTagsChange(event.target.checked)}
                    />
                    Include any selected topic
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={preferences.requireAllSelectedTags === true}
                      onChange={(event) =>
                        onInterestRuleChange('requireAllSelectedTags', event.target.checked)
                      }
                    />
                    Include all selected topics
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={preferences.excludeUnselectedTags === true}
                      onChange={(event) =>
                        onInterestRuleChange('excludeUnselectedTags', event.target.checked)
                      }
                    />
                    Exclude unselected topics
                  </label>
                </fieldset>
                <p className={styles.matchHint}>
                  Uses available topic tags. Explicit exclusions always apply.
                  {loaded &&
                    ` ${candidates.length} of ${publicCandidateCount} fetched items are in this prioritized scoring batch (maximum 300).`}
                </p>
              </div>
            </InterestIntro>
            <section className={styles.scorePanel} aria-label="Feed relevance">
              <div className={styles.scorePanelTop}>
                <div>
                  <span className={styles.eyebrow}>YOUR FEED</span>
                  <h2>Relevance</h2>
                </div>
                <button
                  type="button"
                  className={styles.expandButton}
                  aria-expanded={relevanceDetailsOpen}
                  aria-controls={relevanceDetailsId}
                  onClick={() => setRelevanceDetailsOpen((open) => !open)}
                >
                  <ChevronDown size={16} aria-hidden="true" />
                  {relevanceDetailsOpen ? 'Collapse' : 'Expand'}
                </button>
              </div>
              <InterestIntroTarget
                active={guideStep === 4}
                step={5}
                instruction="Move Relevance to choose how closely the feed should match your interests."
                className={styles.guideSlider}
              >
                <label className={styles.scoreSlider}>
                  <span>Relevance: {targetAverage} / 10</span>
                  <input
                    type="range"
                    aria-label="Relevance"
                    min="1"
                    max="10"
                    step="1"
                    value={targetAverage}
                    onChange={(event) => {
                      onTargetJevAverageChange(Number(event.target.value));
                      onGuideAdvance(4);
                    }}
                  />
                  {relevanceDetailsOpen && (
                    <span className={styles.rangeEndpoints}>
                      <span>Lower · Broader</span>
                      <span>Higher · More focused</span>
                    </span>
                  )}
                </label>
              </InterestIntroTarget>
              <div
                id={relevanceDetailsId}
                className={styles.cardDetails}
                hidden={!relevanceDetailsOpen}
              >
                <strong className={styles.scoreState}>{scoringState}</strong>
                <p>
                  Only items with a confident Jev score at or above {targetAverage} are shown.
                  Higher means fewer, closer matches.
                </p>
                <p>Actual average: {simulation.average?.toFixed(2) ?? '—'} / 10</p>
                <div className={styles.scoreProgressText}>
                  {simulation.ratedCount} of {candidates.length} candidates scored ({ratedPercent}%)
                  · {simulation.items.length} shown
                  {simulation.lowConfidenceCount > 0 &&
                    ` · ${simulation.lowConfidenceCount} low confidence excluded`}
                </div>
                <progress
                  className={styles.scoreProgress}
                  max={Math.max(1, candidates.length)}
                  value={simulation.ratedCount}
                  aria-label="Jev scoring progress"
                />
              </div>
            </section>
          </div>
          <div className={styles.discoverResults}>
            <div className={styles.feedControls}>
              <label>
                <Compass size={17} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter this feed"
                  aria-label="Filter this feed"
                />
              </label>
              {shown.some(({ candidate }) =>
                ['YouTube', 'Bilibili'].includes(candidate.item.source),
              ) && (
                <label>
                  Videos per row
                  <select
                    aria-label="Videos per row"
                    value={videoColumns}
                    onChange={(event) => setVideoColumns(event.target.value as typeof videoColumns)}
                  >
                    <option value="auto">Auto</option>
                    {[1, 2, 3, 4].map((count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className={styles.simulationStatus} role="status">
              {scoringState}
              {scoringDone &&
                !simulation.targetMet &&
                candidates.length > 0 &&
                ': available confident scores cannot meet this target.'}
            </div>
            {scoringError && (
              <div className={styles.warning} role="alert">
                {scoringError}
              </div>
            )}
            {error && (
              <div className={styles.warning} role="alert">
                {error} Saved links remain available.
              </div>
            )}
            {payload?.warnings.length ? (
              <div className={styles.warning}>
                {payload.health.find((health) => health.labelEn === 'Saved search results')
                  ?.detailEn ?? 'Some sources could not refresh; other sources are still shown.'}
              </div>
            ) : null}
            {dismissed.length > 0 && (
              <div className={styles.undo}>
                <span>Recently hidden</span>
                <div className={styles.undoItems}>
                  {dismissed.map((event) => (
                    <button key={event.id} onClick={() => onUndoEvent(event.id)}>
                      <RotateCcw size={14} /> Restore {new URL(event.itemKey).hostname}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {loading && !payload ? (
              <div className={styles.empty}>Loading public sources…</div>
            ) : null}
            {!loading && !loaded && !goalTags.length && (
              <div className={styles.empty}>
                Choose interests to score a personal feed, then choose a source to fetch.
                <button className={styles.secondary} onClick={onEditInterests}>
                  Choose interests
                </button>
              </div>
            )}
            {!loading && !sourceVideoLoading && !loaded && goalTags.length > 0 && (
              <div className={styles.empty}>
                Fetch public sources above, or choose one in Sources to begin.
              </div>
            )}
            {!loading && loaded && candidates.length === 0 ? (
              <div className={styles.empty}>
                {searchTag
                  ? `No public candidates matched "${searchTag}". Try a different search or clear it to return to your interests.`
                  : 'No matching public candidates right now. Try adjusting your interests or inspect the source boards. Feeder does not invent matches.'}
              </div>
            ) : null}
            {!loading && loaded && candidates.length > 0 && !scoring && visible.length === 0 ? (
              <div className={styles.empty}>
                No confident Jev scores meet your Relevance setting.
              </div>
            ) : null}
            {scoring && shown.length === 0 && (
              <div className={styles.scoringPlaceholder} aria-live="polite">
                <span className={styles.skeleton} />
                <span>Scoring candidate titles with Jev…</span>
              </div>
            )}
            <div
              className={
                shown.some(({ candidate }) =>
                  ['YouTube', 'Bilibili'].includes(candidate.item.source),
                )
                  ? styles.videoCards
                  : styles.cards
              }
              data-columns={videoColumns}
            >
              {shown.map(({ candidate, rating }) => {
                const { item } = candidate;
                const saved = savedKeys.has(candidate.key);
                return (
                  <article className={styles.card} key={candidate.key}>
                    <div className={styles.cardMeta}>
                      <span>{item.source}</span>
                      <span>·</span>
                      <span>{item.author || 'Creator unavailable'}</span>
                      {item.publishedAt && (
                        <>
                          <span>·</span>
                          <time dateTime={item.publishedAt}>
                            {new Date(item.publishedAt).toLocaleDateString('en-US')}
                          </time>
                        </>
                      )}
                    </div>
                    {item.source === 'YouTube' ? (
                      <YouTubeVideo item={item} />
                    ) : item.source === 'Bilibili' ? (
                      <BilibiliVideo item={item} />
                    ) : (
                      item.imageUrl && (
                        <img className={styles.cover} src={item.imageUrl} alt="" loading="lazy" />
                      )
                    )}
                    <h2>{item.title}</h2>
                    {item.summary && <p>{item.summary}</p>}
                    <div className={styles.chips}>
                      {item.tags.slice(0, 4).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                      {candidate.exploratory && <span>Explore</span>}
                    </div>
                    <div className={styles.ratingBadge}>
                      <strong>Jev {rating.score.toFixed(1)} / 10</strong>
                      <span>Confidence {Math.round(rating.confidence * 100)}%</span>
                      <progress max="1" value={rating.confidence} aria-label="Jev confidence" />
                    </div>
                    <details className={styles.why}>
                      <summary>Why this is here</summary>
                      <ul>
                        {candidate.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                      <small>
                        Title relevance with {Math.round(rating.confidence * 100)}% confidence.
                        Feeder simulation, not a source-platform score.
                      </small>
                    </details>
                    <div className={styles.actions}>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => record(item, 'open')}
                      >
                        Open source <ArrowUpRight size={15} />
                      </a>
                      <button type="button" onClick={() => save(item)} disabled={saved}>
                        <Bookmark size={15} /> {saved ? 'Saved' : 'Save to library'}
                      </button>
                      <details className={styles.moreActions}>
                        <summary>More actions</summary>
                        <div>
                          <button
                            onClick={(event) => {
                              record(item, 'hide');
                              event.currentTarget.closest('details')?.removeAttribute('open');
                            }}
                            aria-label={`Hide ${item.title}`}
                          >
                            Hide
                          </button>
                          <button
                            onClick={(event) => {
                              record(item, 'not_interested');
                              event.currentTarget.closest('details')?.removeAttribute('open');
                            }}
                            aria-label={`Not interested in ${item.title}`}
                          >
                            Not interested
                          </button>
                        </div>
                      </details>
                    </div>
                  </article>
                );
              })}
            </div>
            {visible.length > shown.length && (
              <button
                className={styles.loadMore}
                onClick={() => setDisplayCount((count) => count + 20)}
              >
                Show more · {visible.length - shown.length} remaining
              </button>
            )}
            {videoFetchStarted && (
              <div className={styles.olderVideos} ref={loadSentinelRef} aria-live="polite">
                {loading || sourceVideoLoading || loadingOlder ? (
                  <span>Finding older videos…</span>
                ) : olderError ? (
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => void loadOlderVideos()}
                  >
                    {olderError}
                  </button>
                ) : hasOlderPages ? (
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => void loadOlderVideos()}
                  >
                    Load older videos
                  </button>
                ) : (
                  <span>All available video pages loaded.</span>
                )}
              </div>
            )}
          </div>
        </div>
        {showSources && (
          <aside
            className={styles.discoverSources}
            aria-label="Sources"
            data-open={compactPanel === 'sources'}
          >
            <SourceBoards
              locale={locale}
              interestLabels={interests.map((interest) => interest.labelEn)}
              localizedInterestLabels={interests.map((interest) => interest.labelZh)}
              preferences={preferences}
              initialPayload={payload}
              onHarvested={(incoming, append, source) => {
                if (source && incoming.health.some((health) => health.section !== 'social'))
                  setVideoFetchStarted(false);
                setPayload((current) =>
                  append
                    ? appendHarvestPayload(current, incoming)
                    : mergeHarvestPayload(current, incoming),
                );
                setLoaded(true);
                if (source === 'YouTube' || source === 'Bilibili') {
                  setVideoPages((current) => ({
                    ...current,
                    [source]: {
                      cursor: incoming.nextCursor ?? null,
                      tags: interests.slice(0, 2).map((interest) => interest.labelEn),
                      localizedTags: interests.slice(0, 2).map((interest) => interest.labelZh),
                    },
                  }));
                }
              }}
              onSocialImport={(item) => {
                setSocialImports((current) => [
                  item,
                  ...current.filter((entry) => entry.url !== item.url),
                ]);
                setLoaded(true);
              }}
              t={(zh, en) => t(zh, en, locale)}
              onEditInterests={onEditInterests}
              onVideoFetchStart={(source) => {
                setVideoFetchStarted(true);
                setIsCompact(false);
                setSourceVideoLoading(true);
                setCompactPanel(null);
                setOlderError('');
                setVideoPages((current) => ({ ...current, [source]: undefined }));
              }}
              onVideoFetchEnd={() => setSourceVideoLoading(false)}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
