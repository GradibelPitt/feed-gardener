export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface AccountDatabase {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
}
export async function accountDatabase(): Promise<AccountDatabase> {
  throw new Error('Cloud database unavailable. Use the Sites runtime (pnpm dev:site).');
}
