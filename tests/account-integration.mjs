import assert from 'node:assert/strict';
const base = process.env.ACCOUNT_TEST_URL || 'http://127.0.0.1:3108';
const password = 'Integration-only passphrase 493!';
async function request(
  path,
  { cookie, body, method = body ? 'POST' : 'GET', origin = base, account } = {},
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Connection: 'close',
      ...(cookie ? { cookie } : {}),
      ...(account ? { 'X-Feeder-Account': account } : {}),
      ...(body ? { 'Content-Type': 'application/json', Origin: origin } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers
      .getSetCookie()
      .find((x) => /feeder_session=/.test(x))
      ?.split(';')[0],
    headers: response.headers,
  };
}
const stamp = Date.now();
const users = [];
try {
  assert.equal((await request('/api/account/data')).status, 401);
  assert.equal((await request('/api/settings/providers')).status, 401);
  const csrf = await request('/api/account', {
    body: { action: 'register', email: 'csrf@example.test', password, name: 'CSRF' },
    origin: 'https://evil.example',
  });
  assert.equal(csrf.status, 403);
  for (const name of ['Alice', 'Bob']) {
    const result = await request('/api/account', {
      body: { action: 'register', email: `${name}-${stamp}@example.test`, password, name },
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.ok(result.headers.get('set-cookie').includes('HttpOnly'));
    users.push({ ...result.body.account, cookie: result.cookie });
  }
  const [a, b] = users;
  const write = await request('/api/account/data', {
    cookie: a.cookie,
    method: 'PUT',
    account: a.id,
    body: { key: 'workspace', revision: 0, value: { private: 'alice data' }, user_id: b.id },
  });
  assert.equal(write.status, 200);
  assert.deepEqual((await request('/api/account/data', { cookie: a.cookie })).body.value, {
    private: 'alice data',
  });
  assert.equal((await request('/api/account/data', { cookie: b.cookie })).body.value, null);
  assert.equal(
    (await request('/api/account/data', { cookie: b.cookie, account: a.id })).status,
    409,
  );
  assert.equal(
    (
      await request('/api/account/data', {
        cookie: a.cookie,
        method: 'PUT',
        body: { key: 'workspace', revision: 0, value: { private: 'stale' } },
      })
    ).status,
    409,
  );
  assert.equal(
    (await request('/api/account/data?key=credentials', { cookie: a.cookie })).status,
    422,
  );
  const config = await request('/api/settings/providers', {
    cookie: a.cookie,
    method: 'PUT',
    body: { id: 'github', name: 'GitHub', values: { apiKey: 'alice-secret-test-only' } },
  });
  assert.equal(config.status, 200, JSON.stringify(config.body));
  assert.ok(!JSON.stringify(config.body).includes('alice-secret-test-only'));
  assert.equal(config.body.data.find((x) => x.id === 'github').source, 'saved');
  assert.notEqual(
    (await request('/api/settings/providers', { cookie: b.cookie })).body.data.find(
      (x) => x.id === 'github',
    ).source,
    'saved',
  );
  const second = await request('/api/account', {
    body: { action: 'login', email: a.email, password },
  });
  assert.equal(second.status, 200);
  assert.deepEqual((await request('/api/account/data', { cookie: second.cookie })).body.value, {
    private: 'alice data',
  });
  const newerPassword = password + ' changed';
  const change = await request('/api/account', {
    cookie: a.cookie,
    body: { action: 'password', currentPassword: password, password: newerPassword },
  });
  assert.equal(change.status, 200);
  assert.equal((await request('/api/account/data', { cookie: second.cookie })).status, 401);
  assert.equal(
    (await request('/api/account', { body: { action: 'login', email: a.email, password } })).status,
    401,
  );
  const login = await request('/api/account', {
    body: { action: 'login', email: a.email, password: newerPassword },
  });
  assert.equal(login.status, 200);
  a.cookie = login.cookie;
  a.password = newerPassword;
  assert.equal(
    (await request('/api/account/data', { cookie: 'feeder_session=' + '0'.repeat(64) })).status,
    401,
  );
  console.log(
    'PASS: cloud runtime registration, login, cross-device persistence, account isolation, stale-tab protection, encrypted API settings, CSRF, password rotation, session revocation and invalid cookies',
  );
} finally {
  for (const user of users) {
    const result = await request('/api/account', {
      cookie: user.cookie,
      body: { action: 'delete', currentPassword: user.password || password },
    });
    assert.equal(result.status, 200, 'Test account cleanup failed');
    assert.equal((await request('/api/account/data', { cookie: user.cookie })).status, 401);
  }
}
