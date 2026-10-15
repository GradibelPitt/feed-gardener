import { test, expect } from '@playwright/test';

test('Settings migrates Garden, persists the Shorts switch, and controls nearby requests and labels', async ({
  page,
  isMobile,
}, info) => {
  await page.addInitScript(() => {
    localStorage.setItem('feed-gardener:setup-guide:v2', '6');
    if (!localStorage.getItem('feed-gardener-demo-v1'))
      localStorage.setItem(
        'feed-gardener-demo-v1',
        JSON.stringify({
          page: 'garden',
          preferences: {
            domains: ['ai-infrastructure'],
            tags: ['agents'],
            shortsDurationFilterEnabled: false,
            blockedSources: ['Bilibili'],
          },
        }),
      );
  });
  let suggestions = 0;
  const searches: string[] = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = {};
    if (url.pathname === '/api/tags/suggest') {
      suggestions++;
      data = { suggestions: [{ labelEn: 'Robot learning', label: 'Robot learning' }] };
    } else if (url.pathname === '/api/harvest') {
      const topic = url.searchParams.get('tag')!;
      searches.push(topic);
      const id = topic === 'Agents' ? '00000000001' : '00000000002';
      data = {
        sections: {
          social: [
            {
              id: `youtube-${id}`,
              source: 'YouTube',
              section: 'social',
              title: `${topic} video`,
              author: 'Test creator',
              url: `https://www.youtube.com/watch?v=${id}`,
              summary: '',
              tags: ['Agent'],
              domain: 'ai-infrastructure',
              domainKeywords: [],
              publishedAt: null,
              durationSeconds: 600,
              provenance: { mode: 'public_api', sourceUrl: 'https://youtube.com' },
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
      data = { decision: { provider: 'jev', relevanceScore: 4, confidence: 0.95 } };
    }
    await route.fulfill({ json: { data, meta: { contractVersion: 'feed-gardener-api/2' } } });
  });
  await page.route('**/www.youtube.com/**', (route) => route.abort());
  const navigation = page.locator(isMobile ? '.mobile-tab-bar' : '.sidebar');
  const toggle = page.getByRole('switch', { name: 'you may also interested in' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#settings$/);
  await expect(toggle).toBeChecked();
  expect(
    (
      await navigation
        .locator(isMobile ? ':scope > button' : 'nav button.nav-item')
        .allTextContents()
    ).slice(0, 4),
  ).toEqual(
    isMobile
      ? ['Discover', 'Shorts', 'Library', 'Settings']
      : ['Discover', 'Shorts', 'Resource library', 'Settings'],
  );
  await expect(
    navigation
      .getByRole('button', { name: 'Settings', exact: true })
      .locator('svg.lucide-settings'),
  ).toHaveCount(1);
  expect(suggestions).toBe(0);
  await page.screenshot({ path: info.outputPath('settings.png'), fullPage: true });
  await toggle.uncheck();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('feed-gardener-demo-v1')!).preferences.shortsNearbyTopics,
      ),
    )
    .toBe(false);
  await page.reload();
  await expect(toggle).not.toBeChecked();
  await navigation.getByRole('button', { name: 'Shorts', exact: true }).click();
  await expect(page.locator('.short-card')).toHaveCount(1);
  await expect(page.getByText('You’re caught up for now. Try another refresh.')).toBeVisible();
  expect([...new Set(searches)]).toEqual(['Agents']);
  expect(suggestions).toBe(0);
  await expect(page.getByText('you may also interested in', { exact: true })).toHaveCount(0);
  await navigation.getByRole('button', { name: 'Settings', exact: true }).click();
  await toggle.check();
  await navigation.getByRole('button', { name: 'Shorts', exact: true }).click();
  await expect(page.locator('.short-card')).toHaveCount(2);
  expect(suggestions).toBeGreaterThan(0);
  expect([...new Set(searches)]).toEqual(['Agents', 'Robot learning']);
  await page.locator('.shorts-viewport').evaluate((element) => {
    element.scrollTop = element.clientHeight;
  });
  const nearbyLabel = page.getByText('you may also interested in', { exact: true });
  await expect(
    page.getByRole('article', { name: 'Robot learning video', exact: true }),
  ).toBeInViewport();
  const viewport = page.viewportSize()!;
  if (isMobile && viewport.height <= 520 && viewport.width > viewport.height) {
    // The compact landscape layout intentionally hides topic labels to leave room for the video.
    await expect(nearbyLabel).toHaveCount(1);
    await expect(nearbyLabel).toBeHidden();
  } else {
    await expect(nearbyLabel).toBeInViewport();
  }
  await page.screenshot({ path: info.outputPath('nearby-label.png'), fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
  await page.goto('/#garden');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#settings$/);
  await expect(toggle).toBeChecked();
});

test('Shorts duration filter defaults to two minutes and saves presets, custom seconds, and off', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('feed-gardener:setup-guide:v2', '6');
    if (!localStorage.getItem('feed-gardener-demo-v1'))
      localStorage.setItem(
        'feed-gardener-demo-v1',
        JSON.stringify({
          page: 'settings',
          preferences: {
            domains: ['ai-infrastructure'],
            tags: ['agents'],
            shortsNearbyTopics: false,
            blockedSources: ['Bilibili'],
          },
        }),
      );
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = {};
    if (url.pathname === '/api/harvest') {
      data = {
        sections: {
          social: [30, 60, 90, 120, 121].map((durationSeconds, index) => {
            const id = String(index + 1).padStart(11, '0');
            return {
              id: `youtube-${id}`,
              source: 'YouTube',
              section: 'social',
              title: `Clip ${durationSeconds}`,
              author: 'Test creator',
              url: `https://www.youtube.com/watch?v=${id}`,
              summary: '',
              tags: ['Agent'],
              domain: 'ai-infrastructure',
              domainKeywords: [],
              publishedAt: null,
              durationSeconds,
              provenance: { mode: 'public_api', sourceUrl: 'https://youtube.com' },
            };
          }),
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
  await page.goto('/');
  const filter = page.getByRole('switch', { name: 'Filter videos longer than' });
  await expect(filter).toBeChecked();
  await expect(page.getByRole('button', { name: '2 min', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.goto('/#shorts');
  await expect(page.locator('.short-card')).toHaveCount(4);
  await page.goto('/#settings');
  await page.getByRole('button', { name: '30 sec', exact: true }).click();
  await page.goto('/#shorts');
  await expect(page.locator('.short-card')).toHaveCount(1);
  await page.goto('/#settings');
  await page.getByRole('textbox', { name: 'Custom Shorts duration in seconds' }).fill('45');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('feed-gardener-demo-v1')!).preferences
            .shortsMaxDurationSeconds,
      ),
    )
    .toBe(45);
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: 'Custom Shorts duration in seconds' }),
  ).toHaveValue('45');
  await page.goto('/#shorts');
  await expect(page.locator('.short-card')).toHaveCount(1);
  await page.goto('/#settings');
  await filter.uncheck();
  await page.goto('/#shorts');
  await expect(page.locator('.short-card')).toHaveCount(4);
});
