'use client';

import { useEffect, useState } from 'react';
import type { HarvestItem } from '@/lib/crawler/types';
import { bilibiliVideoId } from '@/lib/short-video';

export default function ShortBilibiliPlayer({
  item,
  active,
}: {
  item: HarvestItem;
  active: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const id = bilibiliVideoId(item.url);
  const valid =
    id && item.embedUrl === `https://player.bilibili.com/player.html?bvid=${id}&autoplay=0`;

  useEffect(() => setLoaded(false), [active, item.url]);

  return (
    <div className="short-player" aria-hidden={!active} inert={!active}>
      <div className="short-player-screen">
        {active && valid && (
          <iframe
            className="short-bilibili-frame"
            src={`https://player.bilibili.com/player.html?bvid=${id}&autoplay=1&muted=1`}
            title={`Bilibili: ${item.title}`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setLoaded(true)}
          />
        )}
        {(!active || !loaded) && (
          <div className="short-bilibili-poster">
            {item.imageUrl && <img src={item.imageUrl} alt="" loading="eager" />}
            {active && <span role="status">Loading Bilibili video…</span>}
          </div>
        )}
        {active && !valid && (
          <div className="short-player-message" role="status">
            This video cannot be played here. Open the full video instead.
          </div>
        )}
      </div>
    </div>
  );
}
