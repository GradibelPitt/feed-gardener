export type VideoClip = { start: number; end: number; duration: number };

export function middleClip(seconds: number | undefined): VideoClip | null {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 1) return null;
  const total = Math.floor(seconds);
  const duration = total <= 60 ? total : Math.min(60, Math.max(30, Math.round(total * 0.2)));
  const start = Math.floor((total - duration) / 2);
  return { start, end: start + duration, duration };
}

export function parseVideoDuration(value: string): number | undefined {
  if (!/^\d{1,3}(?::\d{2}){1,2}$/.test(value.trim())) return undefined;
  const parts = value.trim().split(':').map(Number);
  if (parts.slice(1).some((part) => part > 59)) return undefined;
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return seconds > 0 ? seconds : undefined;
}

export function videoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!['www.youtube.com', 'youtube.com', 'youtu.be'].includes(parsed.hostname)) return null;
    const id =
      parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v');
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function bilibiliVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'www.bilibili.com' || parsed.protocol !== 'https:') return null;
    return /^\/video\/(BV[0-9A-Za-z]{10})\/?$/.exec(parsed.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function videoTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
