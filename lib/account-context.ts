import { AsyncLocalStorage } from 'node:async_hooks';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { accountDatabase } from './account-db.ts';
import {
  AccountError,
  accountFailure,
  assertOrigin,
  currentAccount,
  requireAccount,
  type Account,
} from './accounts.ts';
import { apiError } from './api-contract.ts';
import { runtimeEnv } from './runtime-env.ts';
export type ApiStore = Record<string, { name: string; values: Record<string, string> }>;
export const apiContext = new AsyncLocalStorage<{
  account: Account | null;
  store: ApiStore;
  dirty: boolean;
}>();
function key() {
  const value = runtimeEnv().FEEDER_CREDENTIAL_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('Credential encryption is not configured.');
  return Buffer.from(value, 'hex');
}
export function sealStore(store: ApiStore, userId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(userId));
  const data = Buffer.concat([cipher.update(JSON.stringify(store), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}
export function openStore(value: string, userId: string): ApiStore {
  const data = Buffer.from(value, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key(), data.subarray(0, 12));
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString(),
  );
}
export function withAccountContext(
  handler: (request: Request) => Promise<Response>,
  required = false,
) {
  return async (request: Request) => {
    try {
      if (required && request.method !== 'GET') assertOrigin(request);
      const account = required ? await requireAccount(request) : await currentAccount(request);
      const db = account ? await accountDatabase() : null;
      const row =
        db && account
          ? await db
              .prepare(
                "SELECT value,revision FROM account_data WHERE user_id = ? AND data_key = 'credentials'",
              )
              .bind(account.id)
              .first<{ value: string; revision: number }>()
          : null;
      const context = {
        account,
        store: row && account ? openStore(row.value, account.id) : {},
        dirty: false,
      };
      return await apiContext.run(context, async () => {
        const response = await handler(request);
        if (context.dirty && db && account && response.ok) {
          const value = sealStore(context.store, account.id);
          const result = row
            ? await db
                .prepare(
                  "UPDATE account_data SET value = ?, revision = revision + 1 WHERE user_id = ? AND data_key = 'credentials' AND revision = ?",
                )
                .bind(value, account.id, row.revision)
                .run()
            : await db
                .prepare(
                  "INSERT INTO account_data(user_id,data_key,value,revision) VALUES (?,'credentials',?,1) ON CONFLICT(user_id,data_key) DO NOTHING",
                )
                .bind(account.id, value)
                .run();
          if (!result.meta.changes)
            throw new AccountError(409, 'Settings changed in another tab. Reload before editing.');
        }
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
      });
    } catch (error) {
      const response = apiError(
        error instanceof AccountError ? error.status : 503,
        'ACCOUNT_ERROR',
        error instanceof AccountError
          ? error.message
          : 'Account service unavailable. Please try again.',
      );
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }
  };
}
