import test from 'node:test';
import assert from 'node:assert/strict';
import { apiContext, sealStore, openStore, type ApiStore } from './account-context.ts';
import { assertOrigin } from './accounts.ts';
import {
  apiSetting,
  apiConfigurationRevision,
  clearApiConfiguration,
  listApiConfigurations,
  saveApiConfiguration,
} from './api-settings.ts';

test('credentials persist encrypted, summaries redact secrets, edits preserve keys, removal disables fallback', () => {
  const context = {
    account: { id: 'alice', name: 'Alice', email: 'alice@example.test', created_at: 1 },
    store: {} as ApiStore,
    dirty: false,
  };
  const previousEncryptionKey = process.env.FEEDER_CREDENTIAL_KEY;
  process.env.FEEDER_CREDENTIAL_KEY = '11'.repeat(32);
  const previousKey = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'environment-test-token';
  try {
    apiContext.run(context, () => {
      assert.equal(apiSetting('github'), 'environment-test-token');
      assert.throws(
        () => saveApiConfiguration({ id: 'github', name: 'GitHub', values: {} }),
        /Enter/,
      );
      saveApiConfiguration({
        id: 'github',
        name: 'GitHub',
        values: { apiKey: 'private-test-token' },
      });
      assert.equal(apiSetting('github'), 'private-test-token');
      const sealed = sealStore(context.store, 'alice');
      assert.equal(sealed.includes('private-test-token'), false);
      assert.deepEqual(openStore(sealed, 'alice'), context.store);
      assert.throws(() => openStore(sealed, 'bob'));
      assert.throws(() => openStore(sealed.slice(0, -8) + 'AAAAAAAA', 'alice'));
      const summary = listApiConfigurations().find((item) => item.id === 'github')!;
      assert.equal(summary.configured, true);
      assert.deepEqual(summary.secrets, ['apiKey']);
      assert.equal(JSON.stringify(summary).includes('private-test-token'), false);
      const revision = apiConfigurationRevision('github');
      saveApiConfiguration({ id: 'github', name: 'GitHub', values: {} });
      assert.equal(apiSetting('github'), 'private-test-token');
      assert.notEqual(apiConfigurationRevision('github'), revision);
      saveApiConfiguration({
        id: 'custom:example',
        name: 'Example',
        values: { apiKey: 'custom-test', baseUrl: 'https://api.example.com/v1' },
      });
      assert.equal(
        listApiConfigurations().find((item) => item.id === 'custom:example')?.custom,
        true,
      );
      assert.throws(
        () => saveApiConfiguration({ id: '../outside', name: 'Invalid', values: {} }),
        /valid platform/,
      );
      assert.throws(
        () =>
          saveApiConfiguration({
            id: 'multimodal',
            name: 'AI',
            values: { apiKey: 'test', baseUrl: 'javascript:alert(1)', model: 'test' },
          }),
        /HTTPS/,
      );
      assert.throws(
        () =>
          saveApiConfiguration({
            id: 'github',
            name: 'GitHub',
            values: { apiKey: 'test\nHeader: injected' },
          }),
        /Invalid/,
      );
      clearApiConfiguration('github');
      assert.equal(apiSetting('github'), '');
      assert.equal(listApiConfigurations().find((item) => item.id === 'github')?.configured, false);
      clearApiConfiguration('custom:example');
      assert.equal(
        listApiConfigurations().some((item) => item.id === 'custom:example'),
        false,
      );
    });
  } finally {
    if (previousEncryptionKey === undefined) delete process.env.FEEDER_CREDENTIAL_KEY;
    else process.env.FEEDER_CREDENTIAL_KEY = previousEncryptionKey;
    if (previousKey === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousKey;
  }
});

test('management allows same-origin HTTPS and rejects missing or cross-site origins', () => {
  assert.doesNotThrow(() =>
    assertOrigin(
      new Request('https://feeder.example/api', { headers: { origin: 'https://feeder.example' } }),
    ),
  );
  assert.throws(() => assertOrigin(new Request('https://feeder.example/api')), /Feeder/);
  assert.throws(
    () =>
      assertOrigin(
        new Request('https://feeder.example/api', { headers: { origin: 'https://evil.example' } }),
      ),
    /Feeder/,
  );
});
test('concurrent accounts cannot read each other’s credentials', async () => {
  const context = (id: string) => ({
    account: { id, name: id, email: id + '@example.test', created_at: 1 },
    store: {} as ApiStore,
    dirty: false,
  });
  await Promise.all(
    ['alice', 'bob'].map((id) =>
      apiContext.run(context(id), async () => {
        saveApiConfiguration({
          id: 'github',
          name: 'GitHub',
          values: { apiKey: id + '-private-key' },
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(apiSetting('github'), id + '-private-key');
      }),
    ),
  );
  assert.throws(
    () => saveApiConfiguration({ id: 'github', name: 'GitHub', values: { apiKey: 'guest-key' } }),
    /Sign in/,
  );
});
