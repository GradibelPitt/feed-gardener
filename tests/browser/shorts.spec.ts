import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('feed-gardener:setup-guide:v2', '6');
    localStorage.setItem(
      'feed-gardener-demo-v1',
      JSON.stringify({
        preferences: {
          domains: ['ai-infrastructure'],
          tags: ['agents'],
          customTags: [],
          blockedSources: [],
          blockedTags: [],
          targetJevAverage: 8,
        },
      }),
    );
    const host = window as any;
    host.__players = [];
    host.YT = {
      Player: class {
        state = 2;
        time = 0;
        destroyed = false;
        loads: any[] = [];
        muted = true;
        events: any;
        frame: HTMLIFrameElement;
        constructor(element: HTMLElement, options: any) {
          this.events = options.events;
          this.frame = document.createElement('iframe');
          this.frame.title = 'Test YouTube player';
          element.replaceWith(this.frame);
          host.__players.push(this);
          setTimeout(() => this.events.onReady({ target: this }), 0);
        }
        loadVideoById(clip: any) {
          this.loads.push(clip);
          this.time = clip.startSeconds;
          this.playVideo();
        }
        playVideo() {
          this.state = 1;
          this.events.onStateChange({ target: this, data: 1 });
        }
        pauseVideo() {
          this.state = 2;
          this.events.onStateChange({ target: this, data: 2 });
        }
        mute() {
          this.muted = true;
        }
        unMute() {
          this.muted = false;
        }
        getDuration() {
          return 600;
        }
        getCurrentTime() {
          return this.time;
        }
        getPlayerState() {
          return this.state;
        }
        seekTo(time: number) {
          this.time = time;
        }
        destroy() {
          this.destroyed = true;
          this.frame.remove();
        }
      },
    };
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let data: any = {};
    if (url.pathname === '/api/harvest') {
      const cursor = Number(url.searchParams.get('cursor') || 0);
      const nearby = url.searchParams.get('tag') === 'Robot learning';
      const items = Array.from({ length: 8 }, (_, n) => {
        const index = cursor * 8 + n + (nearby ? 1000 : 0);
        const id = String(index).padStart(11, '0');
        return {
          id: `youtube-${id}`,
          section: 'social',
          source: 'YouTube',
          title: `Robot learning moment ${index}`,
          author: 'Feeder Lab',
          summary: '',
          tags: ['Agent'],
          domain: 'ai-infrastructure',
          domainKeywords: [],
          publishedAt: null,
          url: `https://www.youtube.com/watch?v=${id}`,
          durationSeconds: 600,
          provenance: {
            mode: 'public_api',
            sourceUrl: 'https://youtube.com',
            fetchedAt: new Date().toISOString(),
          },
        };
      });
      data = {
        sections: { social: items, academic: [], opensource: [] },
        health: [],
        warnings: [],
        nextCursor: String(cursor + 1),
      };
    } else if (url.pathname.includes('decisions')) {
      data = { decision: { provider: 'jev', relevanceScore: 9, confidence: 0.95 } };
    } else if (url.pathname.includes('suggest'))
      data = {
        suggestions: [{ labelEn: 'Robot learning', label: '机器人学习' }],
        liveStatus: 'live',
      };
    else if (url.pathname.includes('connections'))
      data = { status: 'configuration_required', missingConfiguration: [] };
    await route.fulfill({ json: { data, meta: { contractVersion: 'feed-gardener-api/2' } } });
  });
});

test('Shorts stops at clip end, replays, destroys the previous player on scroll, and loads more', async ({
  page,
  isMobile,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#shorts');
  await expect(page.locator('.shorts-heading h1')).toContainText('Shorts');
  await expect(page.locator('.short-card')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Pause clip', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__players.at(-1).loads[0])).toMatchObject({
    startSeconds: 270,
    endSeconds: 330,
  });
  await page.getByRole('button', { name: 'Unmute clip' }).click();
  expect(await page.evaluate(() => (window as any).__players.at(-1).muted)).toBe(false);
  await page.evaluate(() => {
    (window as any).__players.at(-1).time = 330;
  });
  await expect(page.getByRole('button', { name: 'Replay clip' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__players.at(-1).state)).toBe(2);
  await page.getByRole('button', { name: 'Replay clip' }).click();
  await expect(page.getByRole('button', { name: 'Pause clip', exact: true })).toBeVisible();
  await page.locator('.short-card').first().getByRole('button', { name: 'Save video' }).click();
  await expect(
    page.locator('.short-card').first().getByRole('button', { name: 'Video saved' }),
  ).toBeVisible();
  await page.locator('.shorts-viewport').evaluate((element) => {
    element.scrollTop = element.clientHeight;
  });
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__players.filter((p: any) => !p.destroyed).length),
    )
    .toBe(1);
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__players.filter((p: any) => p.destroyed).length),
    )
    .toBeGreaterThan(0);
  await expect(page.locator('.short-card')).toHaveCount(8);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath('shorts.png'), fullPage: true });
  await page
    .locator(isMobile ? '.mobile-tab-bar' : '.sidebar')
    .getByRole('button', { name: 'Discover', exact: true })
    .click();
  await expect(page.locator('.short-player-mount iframe')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__players.every((p: any) => p.destroyed))).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

test('empty interests do not request videos; direct entry and history work', async ({
  page,
  isMobile,
}) => {
  await page.addInitScript(() => localStorage.removeItem('feed-gardener-demo-v1'));
  let harvest = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/harvest')) harvest++;
  });
  await page.goto('/#shorts');
  await expect(page.getByText('Your interests. In motion.')).toBeVisible();
  expect(harvest).toBe(0);
  await page
    .locator(isMobile ? '.mobile-tab-bar' : '.sidebar')
    .getByRole('button', { name: 'Discover', exact: true })
    .click();
  await page.goBack();
  await expect(page.getByText('Your interests. In motion.')).toBeVisible();
});

test('player error keeps next and original-video actions available', async ({ page }) => {
  await page.goto('/#shorts');
  await expect(page.getByRole('button', { name: 'Pause clip', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const p = (window as any).__players.at(-1);
    p.events.onError({ target: p, data: 101 });
  });
  await expect(
    page.getByText('This video is unavailable for embedded playback. Try the next video.'),
  ).toBeVisible();
  await expect(
    page.locator('.short-card').first().getByRole('link', { name: 'Full video' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Next video', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause clip', exact: true })).toBeVisible();
});
