'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import type { HarvestItem } from '@/lib/crawler/types';
import { middleClip, videoId, videoTime } from '@/lib/short-video';
import { loadYouTubePlayer, type YouTubePlayer } from '@/lib/youtube-player';

export default function ShortVideoPlayer({
  item,
  active,
  muted,
  onMutedChange,
}: {
  item: HarvestItem;
  active: boolean;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const player = useRef<YouTubePlayer | null>(null);
  const range = useRef(middleClip(item.durationSeconds));
  const [clip, setClip] = useState(range.current);
  const [status, setStatus] = useState<'loading' | 'playing' | 'paused' | 'ended' | 'error'>(
    'loading',
  );
  const [message, setMessage] = useState('');
  const [errorCode, setErrorCode] = useState<number>();
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const playback = useRef({ active, muted });
  const initialized = useRef(false);
  const failed = useRef(false);
  const mutedAutoplayAttempted = useRef(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  useLayoutEffect(() => {
    playback.current = { active, muted };
    const p = player.current;
    if (!p || !initialized.current) return;
    if (!active || muted || document.hidden) p.mute();
    else p.unMute();
  }, [active, muted]);

  useEffect(() => {
    mutedAutoplayAttempted.current = false;
    const p = player.current;
    if (!p || !initialized.current || failed.current) return;
    if (!active || document.hidden) {
      p.mute();
      p.pauseVideo();
      return;
    }
    const bounds = range.current;
    if (bounds && p.getCurrentTime() >= bounds.end) {
      p.seekTo(bounds.start, false);
      setProgress(0);
    }
    // Keep the buffered media when a prepared card becomes active.
    p.playVideo();
  }, [active]);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let readyTimer: ReturnType<typeof setTimeout> | undefined;
    let configured = false;
    let verified = false;
    let ended = false;
    const id = videoId(item.url);
    const started = Date.now();
    const fail = (text: string) => {
      if (disposed) return;
      failed.current = true;
      if (timer) clearInterval(timer);
      if (readyTimer) clearTimeout(readyTimer);
      player.current?.mute();
      player.current?.pauseVideo();
      setStatus('error');
      setMessage(text);
    };
    const configure = (p: YouTubePlayer, duration: number | undefined) => {
      const next = middleClip(duration);
      if (!next || !id) return false;
      range.current = next;
      setClip(next);
      configured = true;
      ended = false;
      p.loadVideoById({ videoId: id, startSeconds: next.start, endSeconds: next.end });
      return true;
    };
    if (!id) {
      fail('This video cannot be played here.');
      return;
    }
    loadYouTubePlayer()
      .then((api) => {
        if (disposed || !mount.current) return;
        readyTimer = setTimeout(
          () => fail('The video player did not respond. Try the next video.'),
          15000,
        );
        const element = document.createElement('div');
        mount.current.replaceChildren(element);
        player.current = new api.Player(element, {
          width: '100%',
          height: '100%',
          videoId: id,
          playerVars: {
            playsinline: 1,
            controls: window.matchMedia(
              '(max-width: 760px), (max-width: 960px) and (hover: none) and (pointer: coarse)',
            ).matches
              ? 0
              : 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: ({ target }) => {
              if (disposed) return;
              if (readyTimer) clearTimeout(readyTimer);
              initialized.current = true;
              setReady(true);
              if (playback.current.active && !playback.current.muted && !document.hidden)
                target.unMute();
              else target.mute();
              if (!configure(target, item.durationSeconds)) target.playVideo();
              timer = setInterval(() => {
                if (disposed) return;
                const duration = target.getDuration();
                // Search metadata can be absent or stale; reconcile with the actual player duration.
                if (!verified && duration > 0) {
                  verified = true;
                  const actual = middleClip(duration)!;
                  if (
                    !configured ||
                    actual.start !== range.current?.start ||
                    actual.end !== range.current?.end
                  )
                    configure(target, duration);
                }
                if (!configured && Date.now() - started > 20000) {
                  fail('The video duration is unavailable. Try the next video.');
                  return;
                }
                const bounds = range.current;
                if (!configured || !bounds) return;
                if (!playback.current.active || document.hidden || failed.current) return;
                const time = target.getCurrentTime();
                if (target.getPlayerState() === 1) {
                  if (time >= bounds.end) {
                    ended = true;
                    target.pauseVideo();
                    setStatus('ended');
                    setProgress(1);
                  } else if (time < bounds.start - 1) {
                    target.seekTo(bounds.start, true);
                  } else {
                    ended = false;
                    setStatus('playing');
                    setProgress(Math.max(0, Math.min(1, (time - bounds.start) / bounds.duration)));
                  }
                }
              }, 200);
            },
            onStateChange: ({ target, data }) => {
              if (disposed) return;
              // loadVideoById fetches media; cueVideoById only fetches a thumbnail.
              // Pause prepared clips at their first playable frame and retain the buffer.
              if (data === 1 && (!playback.current.active || document.hidden || failed.current)) {
                target.mute();
                target.pauseVideo();
                return;
              }
              if (failed.current) return;
              if (data === 0 && configured) {
                ended = true;
                setStatus('ended');
                setProgress(1);
              } else if (data === 1 && configured) {
                setAutoplayBlocked(false);
                setStatus('playing');
              } else if (data === 3) setStatus('loading');
              else if (data === 2 && !ended) setStatus('paused');
            },
            onAutoplayBlocked: () => {
              if (disposed || failed.current || !playback.current.active || document.hidden) return;
              const p = player.current;
              if (p && !playback.current.muted && !mutedAutoplayAttempted.current) {
                // Browsers may allow muted autoplay even when sound requires a user gesture.
                mutedAutoplayAttempted.current = true;
                playback.current.muted = true;
                onMutedChange(true);
                p.mute();
                p.playVideo();
                return;
              }
              setAutoplayBlocked(true);
              setStatus('paused');
            },
            onError: ({ data }) => {
              if (disposed) return;
              setErrorCode(data);
              fail(
                data === 153
                  ? 'YouTube could not verify this player. Open the full video or try the next one.'
                  : 'This video is unavailable for embedded playback. Try the next video.',
              );
            },
          },
        });
      })
      .catch(() => fail('The player could not connect. Try again or open the original video.'));
    const pauseWhenHidden = () => {
      if (document.hidden) {
        player.current?.mute();
        player.current?.pauseVideo();
      }
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => {
      disposed = true;
      if (timer) clearInterval(timer);
      if (readyTimer) clearTimeout(readyTimer);
      document.removeEventListener('visibilitychange', pauseWhenHidden);
      player.current?.destroy();
      player.current = null;
      initialized.current = false;
      failed.current = false;
    };
  }, [item.url, item.durationSeconds, onMutedChange]);

  function togglePlayback() {
    const p = player.current;
    if (!p || !active || failed.current) return;
    if (muted) p.mute();
    else p.unMute();
    if (status === 'playing') p.pauseVideo();
    else if (status === 'ended' && clip) {
      setProgress(0);
      p.loadVideoById({
        videoId: videoId(item.url)!,
        startSeconds: clip.start,
        endSeconds: clip.end,
      });
    } else p.playVideo();
  }

  return (
    <div
      className="short-player"
      data-player-error={errorCode}
      aria-hidden={!active}
      inert={!active}
    >
      <div className="short-player-screen">
        <div className="short-player-mount" ref={mount} />
        <button
          className="short-player-touch"
          aria-label="Toggle video playback"
          aria-pressed={status === 'playing'}
          onClick={togglePlayback}
          disabled={!ready || status === 'error'}
        >
          {(status === 'paused' || status === 'ended') && (
            <span>{status === 'ended' ? <RotateCcw size={34} /> : <Play size={36} />}</span>
          )}
        </button>
        {status === 'error' && (
          <div className="short-player-message" role="status">
            {message}
          </div>
        )}
        {status === 'loading' && (
          <div className="short-player-loading" role="status">
            Loading your clip…
          </div>
        )}
        {active && autoplayBlocked && status === 'paused' && (
          <button className="short-player-start" onClick={togglePlayback}>
            <Play size={24} /> {muted ? 'Tap to play' : 'Tap to play with sound'}
          </button>
        )}
      </div>
      <div className="short-player-controls">
        <button
          onClick={togglePlayback}
          disabled={!ready || status === 'error'}
          aria-label={
            status === 'playing' ? 'Pause clip' : status === 'ended' ? 'Replay clip' : 'Play clip'
          }
        >
          {status === 'playing' ? (
            <Pause size={19} />
          ) : status === 'ended' ? (
            <RotateCcw size={19} />
          ) : (
            <Play size={19} />
          )}
        </button>
        <span>
          {clip ? `${videoTime(clip.start)} – ${videoTime(clip.end)}` : 'Finding the middle…'}
        </span>
        <button
          disabled={!ready || status === 'error'}
          aria-label={muted ? 'Unmute clip' : 'Mute clip'}
          onClick={() => {
            const p = player.current;
            if (!p) return;
            mutedAutoplayAttempted.current = false;
            playback.current.muted = !muted;
            if (muted) p.unMute();
            else p.mute();
            onMutedChange(!muted);
            if (autoplayBlocked) p.playVideo();
          }}
        >
          {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
        </button>
      </div>
      <progress aria-label="Clip progress" max="1" value={progress} />
    </div>
  );
}
