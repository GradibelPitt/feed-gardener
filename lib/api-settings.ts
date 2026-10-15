import { randomUUID } from 'node:crypto';
import { API_PROVIDERS, CUSTOM_API_FIELDS, type ApiConfigurationSummary } from './api-providers.ts';
import { apiContext, type ApiStore as Store } from './account-context.ts';
import { runtimeEnv } from './runtime-env.ts';
const ENV_FIELDS: Record<string, Record<string, string>> = {
  youtube: { apiKey: 'YOUTUBE_API_KEY' },
  github: { apiKey: 'GITHUB_TOKEN' },
  scholar: { apiKey: 'SERPAPI_API_KEY' },
  typesafe: {
    apiKey: 'TYPESAFE_API_KEY',
    baseUrl: 'TYPESAFE_API_BASE_URL',
    model: 'TYPESAFE_MODEL',
  },
  multimodal: {
    apiKey: 'MULTIMODAL_API_KEY',
    baseUrl: 'MULTIMODAL_API_BASE_URL',
    model: 'MULTIMODAL_MODEL',
  },
  instagram: { apiKey: 'INSTAGRAM_OEMBED_TOKEN', baseUrl: 'INSTAGRAM_OEMBED_ENDPOINT' },
};

function readStore(): Store {
  return apiContext.getStore()?.store || {};
}
function writeStore(store: Store) {
  const context = apiContext.getStore();
  if (!context?.account) throw new Error('Sign in to manage API settings.');
  context.store = store;
  context.dirty = true;
}
export function apiSetting(provider: string, field = 'apiKey'): string {
  const entry = readStore()[provider];
  if (entry) return entry.values[field] || '';
  const env = ENV_FIELDS[provider]?.[field];
  return env ? runtimeEnv()[env]?.trim() || '' : '';
}

export function hasSavedApiConfiguration(provider: string): boolean {
  return Boolean(readStore()[provider]);
}

export function apiConfigurationRevision(provider: string): string {
  // A non-secret cache discriminator that changes whenever this configuration is saved.
  const entry = readStore()[provider];
  return `${apiContext.getStore()?.account?.id || 'guest'}:${entry?.values._revision || ''}`;
}

export function listApiConfigurations(): ApiConfigurationSummary[] {
  const store = readStore();
  const providers = [
    ...API_PROVIDERS,
    ...Object.entries(store)
      .filter(([id]) => id.startsWith('custom:'))
      .map(([id, entry]) => ({ id, name: entry.name, fields: CUSTOM_API_FIELDS })),
  ];
  return providers.map((provider) => {
    const values: Record<string, string> = {};
    const secrets: string[] = [];
    let configured = true;
    let hasEnvironment = false;
    for (const field of provider.fields) {
      const value = store[provider.id]
        ? store[provider.id].values[field.id] || ''
        : apiSetting(provider.id, field.id);
      if (value) hasEnvironment = true;
      if (field.required && !value) configured = false;
      if (field.secret) {
        if (value) secrets.push(field.id);
      } else values[field.id] = value;
    }
    return {
      id: provider.id,
      name: provider.name,
      configured,
      source: store[provider.id] ? 'saved' : hasEnvironment ? 'environment' : 'none',
      values,
      secrets,
      custom: provider.id.startsWith('custom:'),
    };
  });
}

export function saveApiConfiguration(input: unknown): void {
  if (!input || typeof input !== 'object') throw new Error('Invalid configuration.');
  const { id, name, values } = input as Record<string, unknown>;
  if (
    typeof id !== 'string' ||
    (!API_PROVIDERS.some((item) => item.id === id) && !/^custom:[a-zA-Z0-9-]{1,64}$/.test(id))
  )
    throw new Error('Choose a valid platform.');
  if (typeof name !== 'string' || !name.trim() || name.length > 80)
    throw new Error('Enter a platform name (up to 80 characters).');
  if (!values || typeof values !== 'object' || Array.isArray(values))
    throw new Error('Invalid fields.');
  const fields = API_PROVIDERS.find((item) => item.id === id)?.fields || CUSTOM_API_FIELDS;
  const store = readStore();
  const next: Record<string, string> = {};
  for (const field of fields) {
    const raw = (values as Record<string, unknown>)[field.id];
    if (
      raw !== undefined &&
      (typeof raw !== 'string' || raw.length > 4096 || /[\r\n\x00]/.test(raw))
    )
      throw new Error(`Invalid ${field.label}.`);
    // A personal endpoint must never inherit a platform-owned secret.
    const value =
      typeof raw === 'string'
        ? raw.trim()
        : field.secret
          ? store[id]?.values[field.id] || ''
          : apiSetting(id, field.id);
    if (field.required && !value) throw new Error(`Enter ${field.label}.`);
    if (field.id === 'baseUrl' && value) {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new Error('Enter a valid API URL.');
      }
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
        throw new Error('Use an HTTPS API URL without credentials, query parameters or fragments.');
    }
    next[field.id] = value;
  }
  if (!store[id] && Object.keys(store).length >= 50)
    throw new Error('The platform limit has been reached.');
  next._revision = randomUUID();
  store[id] = { name: name.trim(), values: next };
  writeStore(store);
}

export function clearApiConfiguration(id: string): void {
  if (!API_PROVIDERS.some((item) => item.id === id) && !/^custom:[a-zA-Z0-9-]{1,64}$/.test(id))
    throw new Error('Invalid platform.');
  const store = readStore();
  if (id.startsWith('custom:')) delete store[id];
  else
    store[id] = {
      name: API_PROVIDERS.find((item) => item.id === id)!.name,
      values: { _revision: randomUUID() },
    };
  writeStore(store);
}
