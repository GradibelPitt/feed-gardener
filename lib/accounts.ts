import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { accountDatabase, type AccountDatabase } from './account-db.ts';

export class AccountError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export type Account = { id: string; email: string; name: string; created_at: number };
type AccountRow = Account & { password_hash: string };
const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function assertOrigin(request: Request) {
  if (
    request.headers.get('origin') !== new URL(request.url).origin ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw new AccountError(403, 'Open this action from Feeder.');
}
export async function readBody(request: Request, limit = 16000) {
  let originError: unknown;
  try {
    assertOrigin(request);
  } catch (error) {
    originError = error;
  }
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new AccountError(415, 'Expected JSON.');
  const reader = request.body?.getReader();
  if (!reader) throw new AccountError(400, 'Expected JSON.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new AccountError(413, 'Request is too large.');
    }
    chunks.push(value);
  }
  if (originError) throw originError;
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new AccountError(400, 'Expected a JSON object.');
  }
}
export function validatePassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || [...password].length < 15 || password.length > 128)
    throw new AccountError(422, 'Use a password between 15 and 128 characters.');
}
export function normalizeEmail(value: unknown) {
  if (
    typeof value !== 'string' ||
    value.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  )
    throw new AccountError(422, 'Enter a valid email address.');
  return value.trim().toLowerCase();
}
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt-v1$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [version, salt, hash] = encoded.split('$');
  if (version !== 'scrypt-v1' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{64}$/.test(hash))
    return false;
  return timingSafeEqual(await derive(password, salt), Buffer.from(hash, 'hex'));
}
const cookieName = (request: Request) =>
  new URL(request.url).protocol === 'https:' ? '__Host-feeder_session' : 'feeder_session';
export function sessionToken(request: Request) {
  const name = cookieName(request);
  return (
    (request.headers.get('cookie') || '')
      .split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith(`${name}=`))
      ?.slice(name.length + 1) || ''
  );
}
export function sessionCookie(request: Request, token: string, clear = false) {
  return `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_SECONDS}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export async function currentAccount(
  request: Request,
  db?: AccountDatabase,
): Promise<Account | null> {
  const token = sessionToken(request);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const account = await (db || (await accountDatabase()))
    .prepare(
      'SELECT a.id, a.email, a.name, a.created_at FROM accounts a JOIN account_sessions s ON s.user_id = a.id WHERE s.token_hash = ? AND s.expires_at > ?',
    )
    .bind(digest(token), Date.now())
    .first<Account>();
  const expected = request.headers.get('x-feeder-account');
  if (expected && expected !== account?.id)
    throw new AccountError(409, 'The active account changed. Reload this page.');
  return account;
}
export async function requireAccount(request: Request, db?: AccountDatabase) {
  const account = await currentAccount(request, db);
  if (!account) throw new AccountError(401, 'Sign in to your account.');
  const expected = request.headers.get('x-feeder-account');
  if (expected && expected !== account.id)
    throw new AccountError(409, 'The active account changed. Reload this page.');
  return account;
}
export async function rateLimit(db: AccountDatabase, key: string, limit: number, seconds = 900) {
  const now = Date.now();
  const bucket = digest(key);
  const row = await db
    .prepare(
      'INSERT INTO account_limits(bucket, attempts, expires_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET attempts = CASE WHEN expires_at <= ? THEN 1 ELSE attempts + 1 END, expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END RETURNING attempts',
    )
    .bind(bucket, now + seconds * 1000, now, now)
    .first<{ attempts: number }>();
  if (!row || row.attempts > limit)
    throw new AccountError(429, 'Too many attempts. Try again in 15 minutes.');
  if (Math.random() < 0.02)
    await db.prepare('DELETE FROM account_limits WHERE expires_at < ?').bind(now).run();
}
export async function accountAction(request: Request, db: AccountDatabase) {
  const body = await readBody(request);
  const action = body.action;
  if (action === 'register' || action === 'login') {
    const email = normalizeEmail(body.email);
    if (typeof body.password !== 'string' || body.password.length > 128)
      throw new AccountError(422, 'Enter your password.');
    const ip = request.headers.get('cf-connecting-ip') || 'unavailable';
    await rateLimit(db, `auth-ip:${ip}`, 30);
    await rateLimit(db, `auth-email:${email}`, 10);
    let row: AccountRow | null;
    if (action === 'register') {
      validatePassword(body.password);
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
      if (!name) throw new AccountError(422, 'Enter your name.');
      const password_hash = await hashPassword(body.password);
      const id = randomUUID();
      const created_at = Date.now();
      const inserted = await db
        .prepare(
          'INSERT INTO accounts(id,email,name,password_hash,created_at) VALUES (?,?,?,?,?) ON CONFLICT(email) DO NOTHING',
        )
        .bind(id, email, name, password_hash, created_at)
        .run();
      if (!inserted.meta.changes)
        throw new AccountError(422, 'Could not create this account. Try signing in.');
      row = { id, email, name, password_hash, created_at };
    } else {
      row = await db
        .prepare('SELECT * FROM accounts WHERE email = ?')
        .bind(email)
        .first<AccountRow>();
      const valid = await verifyPassword(
        body.password,
        row?.password_hash || `scrypt-v1$${'0'.repeat(32)}$${'0'.repeat(64)}`,
      );
      if (!row || !valid) throw new AccountError(401, 'Email or password is incorrect.');
    }
    const token = randomBytes(32).toString('hex');
    await db.batch([
      db
        .prepare('DELETE FROM account_sessions WHERE token_hash = ? OR expires_at <= ?')
        .bind(digest(sessionToken(request)), Date.now()),
      db
        .prepare(
          'INSERT INTO account_sessions(token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)',
        )
        .bind(digest(token), row.id, Date.now(), Date.now() + SESSION_SECONDS * 1000),
    ]);
    return {
      account: { id: row.id, email: row.email, name: row.name, created_at: row.created_at },
      cookie: sessionCookie(request, token),
    };
  }
  if (action === 'logout') {
    await db
      .prepare('DELETE FROM account_sessions WHERE token_hash = ?')
      .bind(digest(sessionToken(request)))
      .run();
    return { account: null, cookie: sessionCookie(request, '', true) };
  }
  const account = await requireAccount(request, db);
  if (action === 'profile') {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 80)
      throw new AccountError(422, 'Enter a name (up to 80 characters).');
    await db
      .prepare('UPDATE accounts SET name = ? WHERE id = ?')
      .bind(body.name.trim(), account.id)
      .run();
    return { account: { ...account, name: body.name.trim() } };
  }
  if (action === 'password' || action === 'delete' || action === 'logout-all') {
    await rateLimit(db, `reauth:${account.id}`, 10);
    const row = await db
      .prepare('SELECT password_hash FROM accounts WHERE id = ?')
      .bind(account.id)
      .first<{ password_hash: string }>();
    if (
      typeof body.currentPassword !== 'string' ||
      body.currentPassword.length > 128 ||
      !row ||
      !(await verifyPassword(body.currentPassword, row.password_hash))
    )
      throw new AccountError(401, 'Current password is incorrect.');
    if (action === 'password') {
      validatePassword(body.password);
      const hash = await hashPassword(body.password);
      await db.batch([
        db.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?').bind(hash, account.id),
        db.prepare('DELETE FROM account_sessions WHERE user_id = ?').bind(account.id),
      ]);
    } else if (action === 'delete') {
      await db.prepare('DELETE FROM accounts WHERE id = ?').bind(account.id).run();
    } else
      await db.prepare('DELETE FROM account_sessions WHERE user_id = ?').bind(account.id).run();
    return { account: null, cookie: sessionCookie(request, '', true) };
  }
  throw new AccountError(422, 'Unknown account action.');
}
export function accountFailure(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof AccountError
          ? error.message
          : 'Cloud account service is unavailable. Please try again.',
    },
    {
      status: error instanceof AccountError ? error.status : 503,
      headers: { 'Cache-Control': 'private, no-store' },
    },
  );
}
