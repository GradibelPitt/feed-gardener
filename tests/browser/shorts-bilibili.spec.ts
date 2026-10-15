import { expect, test } from '@playwright/test';

const biliId = 'BV1pYaA6FE5T';

test('Shorts plays Bilibili when YouTube is blocked and keeps loading platforms independently', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('feed-gardener:setup-guide:v2', '6');
    localStorage.setItem(
      'feed-gardener-demo-v1',
      JSON.stringify({
        page: 'shorts',
        preferences: {
          domains: ['ai-infrastructure'],
          tags: ['agents'],
          blockedSources: ['YouTube'],
          shortsNearbyTopics: false,
        },
      }),
    );
  });
  const sources: string[] = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = {};
    if (url.pathname === '/api/harvest') {
      sources.push(url.searchParams.get('source') ?? '');
      data = {
        sections: {
          social: [
            {
              id: `bilibili-${biliId}`,
              section: 'social',
              source: 'Bilibili',
              title: 'Bilibili short',
              author: 'Bilibili creator',
              summary: '',
              tags: ['Agent'],
              domain: 'ai-infrastructure',
              domainKeywords: [],
              publishedAt: null,
              url: `https://www.bilibili.com/video/${biliId}`,
              embedUrl: `https://player.bilibili.com/player.html?bvid=${biliId}&autoplay=0`,
              durationSeconds: 90,
              provenance: { mode: 'public_api', sourceUrl: 'https://api.bilibili.com' },
            },
          ],
          academic: [],
          opensource: [],
        },
        health: [],
        warnings: [],
        nextCursor: null,
      };
    } else if (url.pathname.includes('decisions')) {
      data = { decision: { provider: 'jev', relevanceScore: 9, confidence: 0.95 } };
    }
    await route.fulfill({ json: { data, meta: { contractVersion: 'feed-gardener-api/2' } } });
  });
  await page.route('**/player.bilibili.com/**', (route) =>
    route.fulfill({ body: '<html></html>', contentType: 'text/html' }),
  );
  await page.goto('/#shorts');
  await expect(page.getByRole('article', { name: 'Bilibili short' })).toBeVisible();
  await expect(page.locator('.short-bilibili-frame')).toHaveAttribute('src', /autoplay=1/);
  expect(sources.length).toBeGreaterThan(0);
  expect(sources.every((source) => source === 'Bilibili')).toBe(true);
});

test('a slow Bilibili search does not hold up available YouTube Shorts', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('feed-gardener:setup-guide:v2', '6');
    localStorage.setItem(
      'feed-gardener-demo-v1',
      JSON.stringify({
        page: 'shorts',
        preferences: {
          domains: ['ai-infrastructure'],
          tags: ['agents'],
          blockedSources: [],
          shortsNearbyTopics: false,
        },
      }),
    );
  });
  let releaseBilibili: (() => void) | undefined;
  const bilibiliPending = new Promise<void>((resolve) => {
    releaseBilibili = resolve;
  });
  const requested = new Set<string>();
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = {};
    if (url.pathname === '/api/harvest') {
      const source = url.searchParams.get('source')!;
      requested.add(source);
      if (source === 'Bilibili') await bilibiliPending;
      const id = source === 'YouTube' ? 'abcdefghijk' : biliId;
      data = {
        sections: {
          social: [
            {
              id: `${source.toLowerCase()}-${id}`,
              section: 'social',
              source,
              title: `${source} short`,
              author: 'Creator',
              summary: '',
              tags: ['Agent'],
              domain: 'ai-infrastructure',
              domainKeywords: [],
              publishedAt: null,
              url:
                source === 'YouTube'
                  ? `https://www.youtube.com/watch?v=${id}`
                  : `https://www.bilibili.com/video/${id}`,
              ...(source === 'Bilibili'
                ? { embedUrl: `https://player.bilibili.com/player.html?bvid=${id}&autoplay=0` }
                : {}),
              durationSeconds: 60,
              provenance: { mode: 'public_api', sourceUrl: 'https://example.com' },
            },
          ],
          academic: [],
          opensource: [],
        },
        health: [],
        warnings: [],
        nextCursor: null,
      };
    } else if (url.pathname.includes('decisions')) {
      data = { decision: { provider: 'jev', relevanceScore: 9, confidence: 0.95 } };
    }
    await route.fulfill({ json: { data, meta: { contractVersion: 'feed-gardener-api/2' } } });
  });
  await page.route('**/www.youtube.com/**', (route) => route.abort());
  await page.route('**/player.bilibili.com/**', (route) =>
    route.fulfill({ body: '<html></html>', contentType: 'text/html' }),
  );
  await page.goto('/#shorts');
  await expect(page.getByRole('article', { name: 'YouTube short' })).toBeVisible();
  expect(requested.has('Bilibili')).toBe(true);
  await expect(page.getByRole('article', { name: 'Bilibili short' })).toHaveCount(0);
  releaseBilibili?.();
  await expect(page.getByRole('article', { name: 'Bilibili short' })).toBeVisible();
  await expect(page.locator('.short-card')).toHaveCount(2);
});
