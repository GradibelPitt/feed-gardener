import { test, expect } from '@playwright/test';

test('API navigation, custom credential lifecycle and responsive layout', async ({
  page,
  isMobile,
  baseURL,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('account-'), 'Requires Sites D1; run playwright.accounts.config.ts.');
  const accountEmail = `api-browser-${Date.now()}-${testInfo.project.name}@example.test`;
  const accountPassword = 'API browser test passphrase 492!';
  const registration = await page.request.post('/api/account', { headers: { Origin: baseURL! }, data: { action: 'register', email: accountEmail, name: 'API Test', password: accountPassword } });
  expect(registration.ok()).toBe(true);
  await page.addInitScript(() => localStorage.setItem('feed-gardener:setup-guide:v2', '6'));
  await page.goto('/#api');
  await expect(page.getByRole('heading', { name: 'API', exact: true })).toBeVisible();
  await expect(
    page
      .locator(isMobile ? '.mobile-tab-bar' : '.sidebar')
      .getByRole('button', { name: 'API', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Configure GitHub' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('api-settings.png'), fullPage: true });
  const name = `Browser test ${testInfo.project.name}`;
  let id = '';
  try {
    await page.getByRole('button', { name: 'Add platform', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Platform name').fill(name);
    await dialog
      .getByLabel('API key / token', { exact: false })
      .fill('test-only-api-key-1234567890');
    await dialog.getByRole('button', { name: 'Show API key' }).click();
    await expect(dialog.getByLabel('API key / token', { exact: false })).toHaveAttribute(
      'type',
      'text',
    );
    await dialog.getByRole('button', { name: 'Save configuration' }).click();
    await expect(dialog).toBeHidden();
    const data = await (await page.request.get('/api/settings/providers')).json();
    id = data.data.find((item: { name: string }) => item.name === name).id;
    expect(JSON.stringify(data)).not.toContain('test-only-api-key');
    await page.reload();
    const card = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name, exact: true }) });
    await expect(card.getByText('Configured', { exact: true })).toBeVisible();
    await card.getByRole('button').click();
    await expect(dialog.getByLabel('API key / token', { exact: false })).toHaveValue('');
    await dialog.getByLabel('Base URL').fill('https://api.example.com/v1');
    await dialog.getByRole('button', { name: 'Save configuration' }).click();
    await expect(dialog).toBeHidden();
    await card.getByRole('button').click();
    await dialog.getByRole('button', { name: 'Remove credentials' }).click();
    await dialog.getByRole('button', { name: 'Confirm removal' }).click();
    await expect(card).toHaveCount(0);
    id = '';
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
      'test-only-api-key',
    );
  } finally {
    if (id) await page.request.delete('/api/settings/providers', { headers: { Origin: baseURL! }, data: { id } });
    await page.request.post('/api/account', { headers: { Origin: baseURL! }, data: { action: 'delete', currentPassword: accountPassword } });
  }
});
