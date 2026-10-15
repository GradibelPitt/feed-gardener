export type YouTubePlayer = {
  loadVideoById: (clip: { videoId: string; startSeconds: number; endSeconds: number }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  getDuration: () => number;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  destroy: () => void;
};
type PlayerEvent = { target: YouTubePlayer; data: number };
export type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      width: string;
      height: string;
      playerVars: Record<string, number | string>;
      events: {
        onReady: (event: PlayerEvent) => void;
        onStateChange: (event: PlayerEvent) => void;
        onError: (event: PlayerEvent) => void;
        onAutoplayBlocked: () => void;
      };
    },
  ) => YouTubePlayer;
};
let loading: Promise<YouTubeApi> | null = null;

export function loadYouTubePlayer(): Promise<YouTubeApi> {
  const host = window as typeof window & { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void };
  if (host.YT?.Player) return Promise.resolve(host.YT);
  if (loading) return loading;
  loading = new Promise<YouTubeApi>((resolve, reject) => {
    const script = document.createElement('script');
    const previous = host.onYouTubeIframeAPIReady;
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      host.onYouTubeIframeAPIReady = previous;
      if (error) {
        script.remove();
        reject(error);
      } else if (host.YT?.Player) resolve(host.YT);
    };
    const timeout = window.setTimeout(() => finish(new Error('Player timed out')), 15000);
    host.onYouTubeIframeAPIReady = () => {
      finish();
      previous?.();
    };
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => finish(new Error('Player could not load'));
    document.head.append(script);
  }).catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}
