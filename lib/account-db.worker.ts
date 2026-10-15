import { env } from 'cloudflare:workers';
import type { AccountDatabase } from './account-db';
export async function accountDatabase(): Promise<AccountDatabase> {
  const db = (env as unknown as { DB?: AccountDatabase }).DB;
  if (!db) throw new Error('Cloud database binding is unavailable.');
  return db;
}
