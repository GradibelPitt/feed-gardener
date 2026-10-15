'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Bookmark,
  Check,
  RefreshCw,
  SlidersHorizontal,
  Clapperboard,
  Search,
  X,
} from 'lucide-react';
import { searchInterests, type Preferences } from '@/lib/feed';
import type { HarvestItem } from '@/lib/crawler/types';
import { ShortVideoSession, type ShortVideo, type ShortVideoSource } from '@/lib/short-video-feed';
import ShortVideoPlayer from './ShortVideoPlayer';
import ShortBilibiliPlayer from './ShortBilibiliPlayer';
import './short-video.css';

const videoSources: ShortVideoSource[] = ['YouTube', 'Bilibili'];

function mixUpcoming(current: ShortVideo[], incoming: ShortVideo[], active: number): ShortVideo[] {
  if (!current.length || current.every((entry) => entry.item.source === incoming[0]?.item.source))
    return [...current, ...incoming];
  const keep = Math.min(current.length, active + 2);
  const tail = current.slice(keep);
  for (const entry of incoming) {
    tail.splice(Math.floor(Math.random() * (tail.length + 1)), 0, entry);
  }
  return [...current.slice(0, keep), ...tail];
}

type Props = {
  preferences: Preferences;
  onEditInterests: () => void;
  onSave: (item: HarvestItem) => void;
  savedUrls: string[];
};

export default function ShortVideoFeed(props: Props) {
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [muted, setMuted] = useState(false);
  const key = JSON.stringify([props.preferences, revision, query]);
  return (
    <ShortVideoStream
      key={key}
      {...props}
      query={query}
      muted={muted}
      onMutedChange={setMuted}
      onSearch={setQuery}
      onRefresh={() => setRevision((value) => value + 1)}
    />
  );
}

function ShortVideoStream({
  preferences,
  onEditInterests,
  onSave,
  savedUrls,
  onRefresh,
  query,
  onSearch,
  muted,
  onMutedChange,
}: Props & {
  onRefresh: () => void;
  query: string;
  onSearch: (query: string) => void;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
}) {
  const interests = searchInterests(preferences);
  const sourceOrder = useRef(Math.random() < 0.5 ? videoSources : [...videoSources].reverse());
  const sourceKey = sourceOrder.current
    .filter((source) => !preferences.blockedSources.includes(source))
    .join(',');
  const enabled = (interests.length > 0 || !!query) && !!sourceKey;
  const sessions = useRef(new Map<ShortVideoSource, ShortVideoSession>());
  const viewport = useRef<HTMLDivElement>(null);
  const lastScroll = useRef(0);
  const touchStart = useRef<number | null>(null);
  const [searchVisible, setSearchVisible] = useState(!!query);
  const [searchDraft, setSearchDraft] = useState(query);
  const controllers = useRef(new Map<ShortVideoSource, AbortController>());
  const busy = useRef(new Set<ShortVideoSource>());
  const paused = useRef(new Set<ShortVideoSource>());
  const activeRef = useRef(0);
  const [items, setItems] = useState<ShortVideo[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pausedLoading, setPausedLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!enabled) return;
    const sources = sourceKey.split(',') as ShortVideoSource[];
    for (const source of sources) {
      if (busy.current.has(source) || paused.current.has(source)) continue;
      const abort = new AbortController();
      controllers.current.set(source, abort);
      busy.current.add(source);
      setLoading(true);
      setError('');
      let session = sessions.current.get(source);
      if (!session) {
        session = new ShortVideoSession(preferences, fetch, query, source);
        sessions.current.set(source, session);
      }
      void session
        .next(abort.signal)
        .then((next) => {
          if (abort.signal.aborted) return;
          if (next.length) setItems((previous) => mixUpcoming(previous, next, activeRef.current));
          else paused.current.add(source);
          if (session.warning)
            setNotice((previous) =>
              [...new Set([previous, session.warning].filter(Boolean))].join(' '),
            );
        })
        .catch(() => {
          if (abort.signal.aborted) return;
          paused.current.add(source);
          setError('Could not load more videos. Your current clips are still here.');
        })
        .finally(() => {
          if (controllers.current.get(source) !== abort) return;
          controllers.current.delete(source);
          busy.current.delete(source);
          setLoading(busy.current.size > 0);
          setPausedLoading(sources.every((entry) => paused.current.has(entry)));
        });
    }
  }, [enabled, preferences, query, sourceKey]);

  useEffect(() => {
    // Reset after React development effect replay as well as normal mounts.
    busy.current.clear();
    return () => {
      controllers.current.forEach((controller) => controller.abort());
      controllers.current.clear();
      busy.current.clear();
    };
  }, []);

  useEffect(() => {
    if (enabled && !pausedLoading && items.length - active <= 3) load();
  }, [enabled, active, items.length, pausedLoading, load]);

  useEffect(() => {
    const root = viewport.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const index = Number((entry.target as HTMLElement).dataset.index);
            activeRef.current = index;
            setActive(index);
          }
        }
      },
      { root, threshold: [0.6] },
    );
    root.querySelectorAll('[data-index]').forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [items.length]);

  const move = (direction: number) => {
    const index = Math.max(0, Math.min(items.length - 1, active + direction));
    viewport.current
      ?.querySelector(`[data-index="${index}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (direction > 0 && active >= items.length - 2 && !loading) load();
  };

  return (
    <main className="shorts-page" data-page="shorts" data-search-visible={searchVisible}>
      <header className="shorts-heading">
        <div>
          <span className="shorts-eyebrow">A LITTLE CURIOSITY</span>
          <h1>
            Shorts<span>{query ? 'Search' : 'For you'}</span>
          </h1>
        </div>
        <div className="shorts-heading-actions">
          <button
            onClick={() => setSearchVisible((visible) => !visible)}
            aria-label={searchVisible ? 'Hide video search' : 'Search videos'}
            aria-expanded={searchVisible}
            aria-controls="shorts-search"
          >
            <Search size={19} />
          </button>
          <button onClick={onEditInterests} aria-label="Edit Shorts interests">
            <SlidersHorizontal size={19} />
          </button>
          <button onClick={onRefresh} aria-label="Refresh Shorts">
            <RefreshCw size={19} />
          </button>
        </div>
      </header>
      {searchVisible && (
        <form
          id="shorts-search"
          className="shorts-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch(searchDraft.trim());
            (event.currentTarget.elements.namedItem('query') as HTMLInputElement)?.blur();
          }}
        >
          <Search size={18} aria-hidden="true" />
          <input
            name="query"
            type="search"
            enterKeyHint="search"
            aria-label="Search videos"
            placeholder="Search videos"
            maxLength={80}
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
          />
          <button type="submit" aria-label="Submit video search">
            <ArrowUpRight size={20} />
          </button>
          <button
            type="button"
            aria-label="Close search and return to For you"
            onClick={() => {
              setSearchVisible(false);
              setSearchDraft('');
              onSearch('');
            }}
          >
            <X size={18} />
          </button>
        </form>
      )}
      {!enabled ? (
        <div className="shorts-empty">
          <Clapperboard size={38} />
          <h2>
            {interests.length ? 'Video platforms are turned off' : 'Your interests. In motion.'}
          </h2>
          <p>
            {interests.length
              ? 'Enable YouTube or Bilibili in your interests to start watching.'
              : 'Choose a few interests and we’ll find the moments worth watching.'}
          </p>
          <button onClick={onEditInterests}>Choose interests</button>
        </div>
      ) : (
        <>
          <div
            className="shorts-viewport"
            ref={viewport}
            tabIndex={0}
            aria-label="Short video feed"
            onScroll={(event) => {
              const top = event.currentTarget.scrollTop;
              if (top > lastScroll.current + 8) setSearchVisible(true);
              lastScroll.current = top;
            }}
            onTouchStart={(event) => {
              touchStart.current = event.touches[0]?.clientY ?? null;
            }}
            onTouchEnd={(event) => {
              if (
                touchStart.current !== null &&
                touchStart.current - event.changedTouches[0].clientY > 40
              )
                setSearchVisible(true);
              touchStart.current = null;
            }}
            onTouchCancel={() => {
              touchStart.current = null;
            }}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                move(event.key === 'ArrowDown' ? 1 : -1);
              }
            }}
          >
            {items.map((entry, index) => {
              const saved = savedUrls.includes(entry.item.url);
              return (
                <article
                  className="short-card"
                  key={entry.item.id}
                  data-index={index}
                  data-active={index === active}
                  aria-label={entry.item.title}
                >
                  <div className="short-card-topic">
                    <span>
                      {entry.reason === 'nearby'
                        ? 'you may also interested in'
                        : entry.reason === 'broader'
                          ? 'Broader pick'
                          : entry.reason === 'unrated'
                            ? 'More to explore'
                            : 'Your interest'}
                    </span>
                    {entry.topic}
                  </div>
                  {index >= active - 1 && index <= active + 2 ? (
                    entry.item.source === 'Bilibili' ? (
                      <ShortBilibiliPlayer item={entry.item} active={index === active} />
                    ) : (
                      <ShortVideoPlayer
                        key={entry.item.id}
                        item={entry.item}
                        active={index === active}
                        muted={muted}
                        onMutedChange={onMutedChange}
                      />
                    )
                  ) : (
                    <div className="short-inactive">
                      {entry.item.imageUrl && (
                        <img src={entry.item.imageUrl} alt="" loading="lazy" />
                      )}
                      <span>Scroll to watch</span>
                    </div>
                  )}
                  <div className="short-card-detail">
                    <p>
                      {entry.item.author || entry.item.source}
                      <span> · {entry.item.source}</span>
                    </p>
                    <h2>{entry.item.title}</h2>
                  </div>
                  <div className="short-card-actions">
                    <button
                      onClick={() => onSave(entry.item)}
                      disabled={saved}
                      aria-label={saved ? 'Video saved' : 'Save video'}
                    >
                      {saved ? <Check size={18} /> : <Bookmark size={18} />}
                    </button>
                    <a
                      href={entry.item.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Full video"
                    >
                      <ArrowUpRight size={17} />
                    </a>
                    <span className="short-counter">{index + 1}</span>
                  </div>
                </article>
              );
            })}
            <div
              className={`shorts-feed-status ${items.length ? '' : 'shorts-feed-status-initial'}`}
              role="status"
            >
              {loading ? (
                <>
                  <RefreshCw size={23} className="shorts-spin" />
                  <p>Finding your next moments…</p>
                </>
              ) : (
                <>
                  <p>{error || 'You’re caught up for now. Try another refresh.'}</p>
                  <button
                    onClick={() => {
                      paused.current.clear();
                      setPausedLoading(false);
                      load();
                    }}
                  >
                    Try more videos
                  </button>
                </>
              )}
            </div>
          </div>
          {notice && (
            <p className="shorts-notice" role="status">
              {notice}
            </p>
          )}
          {items.length > 0 && (
            <div className="shorts-scroll-controls">
              <span>Scroll for your next moment</span>
              <button onClick={() => move(-1)} disabled={active === 0} aria-label="Previous video">
                <ArrowUp size={18} />
              </button>
              <button onClick={() => move(1)} aria-label="Next video">
                <ArrowDown size={18} />
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
