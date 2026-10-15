import { test, expect } from '@playwright/test';
test('email registration, profile, cloud persistence, sign out and sign in', async ({
  page,
  baseURL,
}, info) => {
  test.skip(
    !info.project.name.startsWith('account-'),
    'Run with playwright.accounts.config.ts against the Sites runtime.',
  );
  const email = `browser-${Date.now()}-${info.project.name}@example.test`;
  const password = 'Browser test passphrase 492!';
  let created = false;
  try {
    await page.goto('/#account');
    await page.getByRole('tab', { name: 'Create account' }).click();
    await page.getByLabel('Your name', { exact: true }).fill('Browser Tester');
    await page.getByLabel('Email address', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'A space of your own.' })).toBeVisible();
    created = true;
    await expect(page.getByText('Saved to your account', { exact: true })).toBeVisible();
    await page.getByLabel('Display name', { exact: true }).fill('Updated Tester');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(page.getByText('Profile updated.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Updated Tester');
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(email);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await page.getByRole('button', { name: 'Sign out / switch account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible();
    await page.getByLabel('Email address', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Updated Tester');
    await expect(page.getByText('Saved to your account', { exact: true })).toBeVisible();
    const data = await (await page.request.get('/api/account/data')).json();
    expect(data.value['feed-gardener-demo-v1']).toBeTruthy();
    await page.screenshot({ path: info.outputPath('account.png'), fullPage: true });
  } finally {
    if (created) {
      await page.request.post('/api/account', {
        headers: { Origin: baseURL! },
        data: { action: 'login', email, password },
      });
      const result = await page.request.post('/api/account', {
        headers: { Origin: baseURL! },
        data: { action: 'delete', currentPassword: password },
      });
      expect(result.ok()).toBe(true);
    }
  }
});
