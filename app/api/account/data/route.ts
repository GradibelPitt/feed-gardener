import { accountDatabase } from '../../../../lib/account-db.ts';
import {
  AccountError,
  accountFailure,
  readBody,
  requireAccount,
} from '../../../../lib/accounts.ts';
const headers = { 'Cache-Control': 'private, no-store' };
const allowed = new Set(['workspace', 'social-imports']);
export async function GET(request: Request) {
  try {
    const db = await accountDatabase();
    const account = await requireAccount(request, db);
    const key = new URL(request.url).searchParams.get('key') || 'workspace';
    if (!allowed.has(key)) throw new AccountError(422, 'Unknown data key.');
    const row = await db
      .prepare('SELECT value,revision FROM account_data WHERE user_id = ? AND data_key = ?')
      .bind(account.id, key)
      .first<{ value: string; revision: number }>();
    return Response.json(
      { value: row ? JSON.parse(row.value) : null, revision: row?.revision || 0 },
      { headers },
    );
  } catch (error) {
    return accountFailure(error);
  }
}
export async function PUT(request: Request) {
  try {
    const body = await readBody(request, 900000);
    const db = await accountDatabase();
    const account = await requireAccount(request, db);
    if (
      typeof body.key !== 'string' ||
      !allowed.has(body.key) ||
      !Number.isSafeInteger(body.revision) ||
      (body.revision as number) < 0 ||
      body.value === undefined
    )
      throw new AccountError(422, 'Invalid data.');
    const value = JSON.stringify(body.value);
    const row = await db
      .prepare(
        'INSERT INTO account_data(user_id,data_key,value,revision) SELECT ?,?,?,1 WHERE ? = 0 ON CONFLICT(user_id,data_key) DO NOTHING RETURNING revision',
      )
      .bind(account.id, body.key, value, body.revision)
      .first<{ revision: number }>();
    const updated =
      row ||
      (await db
        .prepare(
          'UPDATE account_data SET value = ?, revision = revision + 1 WHERE user_id = ? AND data_key = ? AND revision = ? RETURNING revision',
        )
        .bind(value, account.id, body.key, body.revision)
        .first<{ revision: number }>());
    if (!updated)
      throw new AccountError(
        409,
        'This data changed in another tab or device. Reload before editing.',
      );
    return Response.json(updated, { headers });
  } catch (error) {
    return accountFailure(error);
  }
}
