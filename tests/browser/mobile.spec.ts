import { test, expect, type Page } from '@playwright/test';

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(1);
}

async function navigate(page: Page, label: string, mobile: boolean) {
  const names: Record<string, string> = {
    Garden: 'My garden',
    Library: 'Resource library',
    Saved: 'Saved for later',
    Settings: 'Connections & privacy',
  };
  if (!mobile && label === 'Saved') {
    const library = page
      .locator('.sidebar')
      .getByRole('button', { name: 'Resource library', exact: true });
    if ((await library.getAttribute('aria-expanded')) !== 'true') await library.click();
  }
  await page
    .locator(mobile ? '.mobile-tab-bar' : '.sidebar')
    .getByRole('button', { name: mobile ? label : (names[label] ?? label), exact: true })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('feed-gardener:setup-guide:v2', '6'));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data =
      path === '/api/connections/youtube'
        ? {
            status: 'configuration_required',
            permission: 'youtube.readonly',
            missingConfiguration: [],
            redirectUri: '',
          }
        : path === '/api/harvest'
          ? {
              generatedAt: new Date().toISOString(),
              cache: 'fresh',
              sections: { social: [], academic: [], opensource: [] },
              health: [],
              warnings: [],
            }
          : { suggestions: [], status: 'unavailable' };
    await route.fulfill({ json: { data, meta: { contractVersion: 'feed-gardener-api/2' } } });
  });
});

test('navigation, history, responsive shell, and touch targets', async ({
  page,
  isMobile,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible();
  await expect(page.locator('.mobile-tab-bar')).toBeVisible({ visible: !!isMobile });
  await expect(page.locator('.sidebar')).toBeVisible({ visible: !isMobile });
  if (isMobile) {
    for (const button of await page.locator('.mobile-tab-bar button').all()) {
      const bounds = (await button.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.width).toBeGreaterThanOrEqual(44);
    }
  }
  await page.screenshot({ path: testInfo.outputPath('discover.png'), fullPage: true });
  for (const [label, heading] of [
    ['Garden', 'My garden'],
    ['Library', 'Resource library'],
    ['Saved', 'Saved for later'],
    ['Settings', 'Connections & privacy'],
  ]) {
    await navigate(page, label, !!isMobile);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expectNoOverflow(page);
  }
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Saved for later' })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Connections & privacy' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('interest sheet saves choices and releases background scroll', async ({
  page,
  isMobile,
}, testInfo) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: isMobile ? 'Interests' : 'Expand', exact: true })
    .first()
    .click();
  await page.getByRole('button', { name: 'Manage interests' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await dialog.getByRole('button', { name: /AI infrastructure/ }).click();
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('interests.png') });
  const save = dialog.getByRole('button', { name: 'Save my interests' });
  await expect(save).toBeInViewport();
  if (isMobile) {
    const bounds = (await dialog.boundingBox())!;
    expect(Math.abs(bounds.y + bounds.height - page.viewportSize()!.height)).toBeLessThan(2);
  }
  await save.click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('feed-gardener-demo-v1')!).preferences.domains,
    ),
  ).toContain('ai-infrastructure');
});

test('save a long-title resource, edit notes, and find it after reload', async ({
  page,
  isMobile,
}, testInfo) => {
  await page.goto('/#library');
  await expect(page.getByRole('heading', { name: 'Resource library' })).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Resource URL' })
    .fill('https://example.com/mobile-reading');
  const title =
    'Reading on a phone: a long resource title that should wrap without hiding the edit and open actions';
  await page.getByLabel('Title (optional)').fill(title);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: `Edit ${title}` }).click();
  const notes = page.locator('.rlib-item textarea');
  await notes.fill('A note saved from the mobile workspace.');
  await notes.blur();
  await expectNoOverflow(page);
  expect(await notes.evaluate((element) => getComputedStyle(element).fontSize)).toBe(
    isMobile ? '16px' : '12px',
  );
  await page.screenshot({ path: testInfo.outputPath('library.png'), fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Edit ${title}` }).click();
  await expect(page.locator('.rlib-item textarea')).toHaveValue(
    'A note saved from the mobile workspace.',
  );
  await navigate(page, 'Saved', !!isMobile);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
});

test('search and source browsing keep refresh accessible', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Search public sources by tag' }).fill('robotics');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh search', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Sources', exact: true }).click();
  await expectNoOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByRole('button', { name: 'Refresh search', exact: true })).toBeVisible();
});

test('home-screen metadata and icon files are served', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    'content',
    /viewport-fit=cover/,
  );
  await expect(page.locator('meta[name="viewport"]')).not.toHaveAttribute(
    'content',
    /user-scalable=no|maximum-scale=1/,
  );
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('image/png');
  }
  expect((await request.get('/icons/apple-touch-icon.png')).ok()).toBeTruthy();
});

test('populated video feed stays readable and saves from a phone', async ({
  page,
  isMobile,
}, testInfo) => {
  await page.route('**/api/harvest?**', async (route) => {
    const items = Array.from({ length: 6 }, (_, index) => ({
      id: `mobile-video-${index}`,
      source: 'YouTube',
      section: 'social',
      title: `Robotics workshop ${index + 1}: building a robot step by step`,
      summary: 'A public-source fixture for mobile layout and save interactions.',
      author: 'Robotics lab',
      url: `https://www.youtube.com/watch?v=mobileTest${index}`,
      tags: ['robotics'],
      domain: 'robotics',
      domainKeywords: ['robotics'],
      publishedAt: '2026-01-01T00:00:00Z',
      provenance: {
        mode: 'official_api',
        sourceUrl: 'https://www.youtube.com',
        fetchedAt: '2026-01-01T00:00:00Z',
      },
    }));
    await route.fulfill({
      json: {
        data: {
          generatedAt: '2026-01-01T00:00:00Z',
          cache: 'fresh',
          sections: { social: items, academic: [], opensource: [] },
          health: [],
          warnings: [],
        },
      },
    });
  });
  await page.route('**/api/agent/v1/decisions/preview', (route) =>
    route.fulfill({
      json: { data: { decision: { provider: 'jev', relevanceScore: 9, confidence: 0.95 } } },
    }),
  );
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Search public sources by tag' }).fill('robotics');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const cards = page.locator('main article');
  await expect(cards).toHaveCount(6);
  if (isMobile) {
    await expect(page.getByLabel('Videos per row')).toBeHidden();
  } else {
    await expect(page.getByLabel('Videos per row')).toBeVisible();
    await page.getByLabel('Videos per row').selectOption('4');
  }
  await expectNoOverflow(page);
  if (isMobile) {
    const first = (await cards.nth(0).boundingBox())!;
    const second = (await cards.nth(1).boundingBox())!;
    expect(first.width).toBeLessThan(page.viewportSize()!.width / 2);
    expect(Math.abs(second.y - first.y)).toBeLessThan(2);
    const actions = cards.first().getByRole('group', { name: /Actions for Robotics workshop 1/ });
    await expect(actions).toBeHidden();
    await expect(cards.first().getByText('More actions')).toBeHidden();
    await cards.first().locator('summary[aria-label^="More actions for"]').click();
    await expect(actions).toBeVisible();
  }
  await cards.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('feed.png'), scale: 'css' });
  await cards
    .first()
    .getByRole('button', { name: isMobile ? /Save Robotics workshop 1:/ : /Save/ })
    .click();
  if (isMobile) {
    await cards.nth(1).locator('summary[aria-label^="More actions for"]').click();
    await cards
      .nth(1)
      .getByRole('button', { name: /Hide Robotics workshop 2:/ })
      .click();
    await expect(cards).toHaveCount(5);
    await cards.nth(1).locator('summary[aria-label^="More actions for"]').click();
    await cards
      .nth(1)
      .getByRole('button', { name: /Not interested in Robotics workshop 3:/ })
      .click();
    await expect(cards).toHaveCount(4);
  }
  await navigate(page, 'Saved', !!isMobile);
  await expect(
    page.getByRole('heading', { name: 'Robotics workshop 1: building a robot step by step' }),
  ).toBeVisible();
});

test('onboarding save remains visible with a short viewport', async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await page.addInitScript(() => localStorage.setItem('feed-gardener:setup-guide:v2', '0'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Interests', exact: true }).click();
  await page.getByRole('button', { name: 'Manage interests', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /AI infrastructure/ }).click();
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 360 });
  const save = dialog.getByRole('button', { name: 'Save my interests' });
  await expect(save).toBeInViewport();
  await save.click();
  await expect(dialog).toHaveCount(0);
  await expectNoOverflow(page);
});

test('switching pages restores library scroll and help returns to the current page', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile);
  await page.goto('/#library');
  await page.getByRole('textbox', { name: 'Resource URL' }).fill('https://example.com/scroll');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const savedY = await page.evaluate(() => window.scrollY);
  expect(savedY).toBeGreaterThan(0);
  await navigate(page, 'Settings', true);
  await expect(page.getByRole('heading', { name: 'Connections & privacy' })).toBeVisible();
  await navigate(page, 'Library', true);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(savedY, 0);
  await page.locator('.mobile-app-header').getByRole('link', { name: 'Instructions' }).click();
  await expect(page.getByRole('heading', { name: 'Start with your interests.' })).toBeVisible();
  await page.getByRole('link', { name: '← Back' }).click();
  await expect(page.getByRole('heading', { name: 'Resource library' })).toBeVisible();
});
