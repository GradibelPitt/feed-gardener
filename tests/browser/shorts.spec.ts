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
          blockedSources: ['Bilibili'],
          blockedTags: [],
          targetJevAverage: 8,
          shortsDurationFilterEnabled: false,
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
        playAttempts = 0;
        videoId: string;
        events: any;
        frame: HTMLIFrameElement;
        constructor(element: HTMLElement, options: any) {
          this.videoId = options.videoId;
          this.events = options.events;
          this.frame = document.createElement('iframe');
          this.frame.title = 'Test YouTube player';
          element.replaceWith(this.frame);
          host.__players.push(this);
          setTimeout(() => {
            if (!this.destroyed) this.events.onReady({ target: this });
          }, host.__readyDelay || 0);
        }
        loadVideoById(clip: any) {
          this.loads.push(clip);
          this.time = clip.startSeconds;
          this.playVideo();
        }
        playVideo() {
          this.playAttempts++;
          if (host.__blockAll || (host.__blockSound && !this.muted)) {
            this.state = 2;
            this.events.onAutoplayBlocked();
            return;
          }
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

test('Shorts stops at clip end, replays, reuses prepared players on scroll, and loads more', async ({
  page,
  isMobile,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#shorts');
  await expect(page.locator('.shorts-heading h1')).toContainText('Shorts');
  await expect(page.locator('.short-card')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Pause clip', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__players[0].loads[0])).toMatchObject({
    startSeconds: 270,
    endSeconds: 330,
  });
  await expect(page.getByRole('button', { name: 'Mute clip', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__players[0].muted)).toBe(false);
  await page.evaluate(() => {
    (window as any).__players[0].time = 330;
  });
  await expect(page.getByRole('button', { name: 'Replay clip' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__players[0].state)).toBe(2);
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
    .toBe(4);
  await expect.poll(() => page.evaluate(() => (window as any).__players[0].state)).toBe(2);
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

test('preloads two clips, preserves buffers and sound preference, and bounds player count', async ({
  page,
}) => {
  await page.goto('/#shorts');
  await expect.poll(() => page.evaluate(() => (window as any).__players.length)).toBe(3);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__players.map((p: any) => ({
          state: p.state,
          muted: p.muted,
          loads: p.loads.length,
        })),
      ),
    )
    .toEqual([
      { state: 1, muted: false, loads: 1 },
      { state: 2, muted: true, loads: 1 },
      { state: 2, muted: true, loads: 1 },
    ]);
  await page.getByRole('button', { name: 'Mute clip', exact: true }).click();
  const scrollTo = async (index: number) => {
    await page.locator('.shorts-viewport').evaluate((element, n) => {
      element.scrollTop = element.clientHeight * n;
    }, index);
    await expect(page.locator(`.short-card[data-index="${index}"]`)).toHaveAttribute(
      'data-active',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Pause clip', exact: true })).toBeVisible();
  };
  await scrollTo(1);
  await expect(page.getByRole('button', { name: 'Unmute clip', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => {
      const p = (window as any).__players[1];
      return { destroyed: p.destroyed, loads: p.loads.length, muted: p.muted, time: p.time };
    }),
  ).toEqual({ destroyed: false, loads: 1, muted: true, time: 270 });
  await page.getByRole('button', { name: 'Unmute clip', exact: true }).click();
  await scrollTo(0);
  await expect(page.getByRole('button', { name: 'Mute clip', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__players[0].loads.length)).toBe(1);
  await scrollTo(2);
  await expect.poll(() => page.evaluate(() => (window as any).__players[0].destroyed)).toBe(true);
  expect(
    await page.evaluate(() => {
      const players = (window as any).__players.filter((p: any) => !p.destroyed);
      return {
        count: players.length,
        audible: players.filter((p: any) => !p.muted).length,
        playing: players.filter((p: any) => p.state === 1).length,
      };
    }),
  ).toEqual({ count: 4, audible: 1, playing: 1 });
});

test('blocked sound falls back to autoplay, keeps buffers, and allows sound to be restored', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).__blockSound = true;
  });
  await page.goto('/#shorts');
  await expect(page.getByRole('button', { name: 'Pause clip', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unmute clip', exact: true })).toBeVisible();
  await expect(page.locator('.short-player-start')).toHaveCount(0);
  await page.locator('.shorts-viewport').evaluate((element) => {
    element.scrollTop = element.clientHeight;
  });
  await expect(page.locator('.short-card[data-index="1"]')).toHaveAttribute('data-active', 'true');
  await expect(page.getByRole('button', { name: 'Pause clip', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => ({
      loads: (window as any).__players[1].loads.length,
      muted: (window as any).__players[1].muted,
    })),
  ).toEqual({ loads: 1, muted: true });
  await page.evaluate(() => {
    (window as any).__blockSound = false;
  });
  await page.getByRole('button', { name: 'Unmute clip', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mute clip', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__players[1].muted)).toBe(false);
  await page.evaluate(() => {
    (window as any).__blockSound = true;
  });
  await page.locator('.shorts-viewport').evaluate((element) => {
    element.scrollTop = element.clientHeight * 2;
  });
  await expect(page.locator('.short-card[data-index="2"]')).toHaveAttribute('data-active', 'true');
  await expect(page.getByRole('button', { name: 'Pause clip', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unmute clip', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__players[2].loads.length)).toBe(1);
});

test('when all autoplay is blocked, retries once and keeps manual playback available', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).__blockAll = true;
  });
  await page.goto('/#shorts');
  await expect(page.getByRole('button', { name: 'Tap to play', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__players[0].playAttempts)).toBe(2);
  await page.evaluate(() => {
    (window as any).__blockAll = false;
  });
  await page.getByRole('button', { name: 'Tap to play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause clip', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause clip', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play clip', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__players[0].state)).toBe(2);
});

test('a player that becomes ready after scrolling stays muted and paused offscreen', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).__readyDelay = 1500;
  });
  await page.goto('/#shorts');
  await expect(page.locator('.short-card')).toHaveCount(4);
  await page.locator('.shorts-viewport').evaluate((element) => {
    element.scrollTop = element.clientHeight;
  });
  await expect(page.locator('.short-card[data-index="1"]')).toHaveAttribute('data-active', 'true');
  await expect(page.getByRole('button', { name: 'Pause clip', exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__players.slice(0, 3).map((p: any) => ({
          state: p.state,
          muted: p.muted,
        })),
      ),
    )
    .toEqual([
      { state: 2, muted: true },
      { state: 1, muted: false },
      { state: 2, muted: true },
    ]);
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
    const p = (window as any).__players[0];
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

test('mobile video fills the viewing area and search opens only from its icon', async ({
  page,
  isMobile,
  browserName,
}, info) => {
  test.skip(!isMobile, 'Mobile immersive layout');
  await page.goto('/#shorts');
  await expect(page.getByRole('button', { name: 'Pause clip', exact: true })).toBeVisible();
  await expect(page.locator('.mobile-app-header')).toBeHidden();
  await expect(page.getByRole('search')).toHaveCount(0);
  const viewport = (await page.locator('.shorts-viewport').boundingBox())!;
  const frame = (await page.locator('.short-card[data-active="true"] iframe').boundingBox())!;
  const nav = (await page.locator('.mobile-tab-bar').boundingBox())!;
  expect(viewport.y).toBe(0);
  expect(frame).toEqual(viewport);
  expect(viewport.height).toBeCloseTo(nav.y, 0);
  for (const action of [
    page.getByRole('button', { name: 'Pause clip', exact: true }),
    page.getByRole('button', { name: 'Mute clip', exact: true }),
    page.locator('.short-card').first().getByRole('button', { name: 'Save video' }),
    page.locator('.short-card').first().getByRole('link', { name: 'Full video' }),
  ]) {
    const box = (await action.boundingBox())!;
    expect(box.x).toBeGreaterThan(viewport.width - 100);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThan(nav.y);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button', { name: 'Toggle video playback' }).tap();
  await expect(page.getByRole('button', { name: 'Play clip', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle video playback' }).tap();
  await expect(page.getByRole('button', { name: 'Pause clip', exact: true })).toBeVisible();
  const savedPreferences = await page.evaluate(() => localStorage.getItem('feed-gardener-demo-v1'));
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    const x = viewport.width / 2;
    const start = viewport.height * 0.8;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y: start }],
    });
    for (let step = 1; step <= 8; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: start - viewport.height * 0.085 * step }],
      });
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      );
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.locator('.shorts-viewport').evaluate((element) => {
      element.scrollTop = element.clientHeight;
    });
  }
  await expect(page.getByRole('search')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).__players[1].state)).toBe(1);
  await expect
    .poll(() =>
      page
        .locator('.shorts-viewport')
        .evaluate((element) =>
          Math.abs(
            element.scrollTop / element.clientHeight -
              Math.round(element.scrollTop / element.clientHeight),
          ),
        ),
    )
    .toBeLessThan(0.01);
  await page.getByRole('button', { name: 'Search videos', exact: true }).click();
  await expect(page.getByRole('search')).toBeVisible();
  const searchInput = page.getByRole('searchbox', { name: 'Search videos' });
  await searchInput.fill('Ocean life');
  const searchRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === '/api/harvest' && url.searchParams.get('tag') === 'Ocean life';
  });
  await page.getByRole('button', { name: 'Submit video search' }).click();
  await searchRequest;
  await expect(page.getByRole('search')).toHaveCount(0);
  await expect(page.locator('.short-card').first().locator('.short-card-topic')).toContainText(
    'Ocean life',
  );
  expect(await page.evaluate(() => localStorage.getItem('feed-gardener-demo-v1'))).toBe(
    savedPreferences,
  );
  expect((await page.locator('.shorts-viewport').boundingBox())!).toEqual(viewport);
  await page.getByRole('button', { name: 'Search videos', exact: true }).click();
  await page.screenshot({ path: info.outputPath('shorts-search.png'), fullPage: true });
  await page.getByRole('button', { name: 'Close search and return to For you' }).click();
  await expect(page.getByRole('search')).toHaveCount(0);
  await expect(page.locator('.shorts-heading h1')).toContainText('For you');
  await page
    .locator('.mobile-tab-bar')
    .getByRole('button', { name: 'Discover', exact: true })
    .click();
  await expect(page.locator('.mobile-app-header')).toBeVisible();
});
