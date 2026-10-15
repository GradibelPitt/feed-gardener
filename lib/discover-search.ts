import type { HarvestItem, HarvestPayload, SourceHealth } from './crawler/types.ts';

export function parseSearchTerms(input: string): string[] {
  const value = input.trim().slice(0, 80);
  const parts = value.split('+').map((part) => part.trim());
  return parts.length === 2 &&
    parts.every(Boolean) &&
    parts[0].toLowerCase() !== parts[1].toLowerCase()
    ? parts
    : value
      ? [value]
      : [];
}

export function searchMatchGroup(
  item: Pick<HarvestItem, 'title' | 'summary'>,
  terms: string[],
): 0 | 1 | 2 | null {
  if (terms.length !== 2) return null;
  const text = `${item.title} ${item.summary}`.normalize('NFKC').toLowerCase();
  const matches = terms.map((term) => {
    const escaped = term
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u').test(text);
  });
  return matches[0] ? (matches[1] ? 0 : 1) : matches[1] ? 2 : null;
}

export function combineSearchPayloads(payloads: HarvestPayload[]): HarvestPayload {
  if (!payloads.length) throw new Error('No public sources could be loaded');
  const seen = new Set<string>();
  const social = payloads
    .flatMap((payload) => payload.sections.social)
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  const health = new Map<SourceHealth['source'], SourceHealth>();
  for (const entry of payloads.flatMap((payload) => payload.health)) {
    const previous = health.get(entry.source);
    if (!previous || (previous.state !== 'live' && entry.state === 'live'))
      health.set(entry.source, entry);
  }
  return {
    generatedAt: payloads[0].generatedAt,
    cache: payloads.some((payload) => payload.cache === 'fresh') ? 'fresh' : payloads[0].cache,
    sections: { social, academic: [], opensource: [] },
    health: [...health.values()].map((entry) => ({
      ...entry,
      itemCount: social.filter((item) => item.source === entry.source).length,
    })),
    warnings: [...new Set(payloads.flatMap((payload) => payload.warnings))],
  };
}
