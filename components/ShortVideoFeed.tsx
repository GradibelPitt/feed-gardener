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
} from 'lucide-react';
import { searchInterests, type Preferences } from '@/lib/feed';
import type { HarvestItem } from '@/lib/crawler/types';
import { ShortVideoSession, type ShortVideo } from '@/lib/short-video-feed';
import ShortVideoPlayer from './ShortVideoPlayer';
import './short-video.css';

type Props = {
  preferences: Preferences;
  onEditInterests: () => void;
  onSave: (item: HarvestItem) => void;
  savedUrls: string[];
};

export default function ShortVideoFeed(props: Props) {
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([props.preferences, revision]);
  return (
    <ShortVideoStream key={key} {...props} onRefresh={() => setRevision((value) => value + 1)} />
  );
}

function ShortVideoStream({
  preferences,
  onEditInterests,
  onSave,
  savedUrls,
  onRefresh,
}: Props & { onRefresh: () => void }) {
  const interests = searchInterests(preferences);
  const enabled = interests.length > 0 && !preferences.blockedSources.includes('YouTube');
  const session = useRef<ShortVideoSession | null>(null);
  if (!session.current) session.current = new ShortVideoSession(preferences);
  const viewport = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const [items, setItems] = useState<ShortVideo[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pausedLoading, setPausedLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (busy.current || !enabled) return;
    const abort = new AbortController();
    controller.current = abort;
    busy.current = true;
    setLoading(true);
    setError('');
    try {
      const next = await session.current!.next(abort.signal);
      if (abort.signal.aborted) return;
      setItems((previous) => [...previous, ...next]);
      setNotice(session.current!.warning);
      setPausedLoading(!next.length);
    } catch {
      if (abort.signal.aborted) return;
      setError('Could not load more videos. Your current clips are still here.');
      setPausedLoading(true);
    } finally {
      if (!abort.signal.aborted) {
        busy.current = false;
        setLoading(false);
      }
    }
  }, [enabled]);

  useEffect(() => {
    // Reset after React development effect replay as well as normal mounts.
    busy.current = false;
    return () => {
      controller.current?.abort();
      busy.current = false;
    };
  }, []);

  useEffect(() => {
    if (enabled && !pausedLoading && active >= items.length - 3) void load();
  }, [enabled, active, items.length, pausedLoading, load]);

  useEffect(() => {
    const root = viewport.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6)
            setActive(Number((entry.target as HTMLElement).dataset.index));
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
    if (direction > 0 && active >= items.length - 2 && !loading) void load();
  };

  return (
    <main className="shorts-page" data-page="shorts">
      <header className="shorts-heading">
        <div>
          <span className="shorts-eyebrow">A LITTLE CURIOSITY</span>
          <h1>
            Shorts<span>For you</span>
          </h1>
        </div>
        <div className="shorts-heading-actions">
          <button onClick={onEditInterests} aria-label="Edit Shorts interests">
            <SlidersHorizontal size={19} />
          </button>
          <button onClick={onRefresh} aria-label="Refresh Shorts">
            <RefreshCw size={19} />
          </button>
        </div>
      </header>
      {!enabled ? (
        <div className="shorts-empty">
          <Clapperboard size={38} />
          <h2>{interests.length ? 'YouTube is turned off' : 'Your interests. In motion.'}</h2>
          <p>
            {interests.length
              ? 'Enable YouTube in your interests to start watching.'
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
                  aria-label={entry.item.title}
                >
                  <div className="short-card-topic">
                    <span>
                      {entry.reason === 'nearby'
                        ? 'Nearby topic'
                        : entry.reason === 'broader'
                          ? 'Broader pick'
                          : entry.reason === 'unrated'
                            ? 'More to explore'
                            : 'Your interest'}
                    </span>
                    {entry.topic}
                  </div>
                  {index === active ? (
                    <ShortVideoPlayer key={entry.item.id} item={entry.item} />
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
                      {entry.item.author || 'YouTube'}
                      <span> · YouTube</span>
                    </p>
                    <h2>{entry.item.title}</h2>
                    <div className="short-card-actions">
                      <button
                        onClick={() => onSave(entry.item)}
                        disabled={saved}
                        aria-label={saved ? 'Video saved' : 'Save video'}
                      >
                        {saved ? <Check size={18} /> : <Bookmark size={18} />}
                        {saved ? 'Saved' : 'Save'}
                      </button>
                      <a href={entry.item.url} target="_blank" rel="noreferrer">
                        Full video <ArrowUpRight size={17} />
                      </a>
                      <span className="short-counter">{index + 1}</span>
                    </div>
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
                      setPausedLoading(false);
                      void load();
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
