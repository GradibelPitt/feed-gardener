'use client';
type SyncStatus = 'guest' | 'saved' | 'saving' | 'error';
let owner: string | null = null;
let values: Record<string, string> = {};
let revision = 0;
let generation = 0;
let savedGeneration = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let inflight: Promise<void> | null = null;
let status: SyncStatus = 'guest';
let message = '';
const listeners = new Set<() => void>();
function update(next: SyncStatus, error = '') {
  status = next;
  message = error;
  listeners.forEach((fn) => fn());
}
export function storageStatus() {
  return { status, message };
}
export function subscribeStorage(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export async function initializeAccountStorage(id: string | null) {
  if (timer) clearTimeout(timer);
  owner = id;
  values = {};
  revision = 0;
  generation = 0;
  savedGeneration = 0;
  if (!id) {
    update('guest');
    return;
  }
  const response = await fetch('/api/account/data', {
    cache: 'no-store',
    headers: { 'X-Feeder-Account': id },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not load your cloud data.');
  if (data.value && typeof data.value === 'object' && !Array.isArray(data.value))
    values = Object.fromEntries(
      Object.entries(data.value).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  revision = data.revision;
  update('saved');
}
export async function flushAccountStorage(): Promise<void> {
  if (inflight) {
    await inflight;
    return flushAccountStorage();
  }
  if (!owner || generation === savedGeneration) return;
  if (status === 'error') throw new Error(message);
  const savingGeneration = generation;
  const snapshot = { ...values };
  const account = owner;
  update('saving');
  inflight = (async () => {
    try {
      const response = await fetch('/api/account/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Feeder-Account': account },
        body: JSON.stringify({ key: 'workspace', value: snapshot, revision }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || 'Cloud sync failed. Keep this tab open and retry.');
      revision = data.revision;
      savedGeneration = savingGeneration;
      update(generation === savedGeneration ? 'saved' : 'saving');
    } catch (error) {
      update('error', error instanceof Error ? error.message : 'Cloud sync failed.');
      throw error;
    } finally {
      inflight = null;
    }
  })();
  await inflight;
  if (generation !== savedGeneration) await flushAccountStorage();
}
export async function retryAccountStorage() {
  update('saving');
  return flushAccountStorage();
}
export const accountStorage = {
  getItem(key: string): string | null {
    if (!owner) return localStorage.getItem(key);
    return values[key] ?? null;
  },
  setItem(key: string, value: string) {
    if (!owner) {
      localStorage.setItem(key, value);
      return;
    }
    if (values[key] === value) return;
    values[key] = value;
    generation++;
    if (status === 'error') return;
    update('saving');
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void flushAccountStorage().catch(() => {});
    }, 350);
  },
};
