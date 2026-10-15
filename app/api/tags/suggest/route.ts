import { apiContext, withAccountContext } from '@/lib/account-context';
import { apiError, apiSuccess } from '@/lib/api-contract';
import {
  fetchGithubTagSuggestions,
  seedTagSuggestions,
  type TagSuggestion,
} from '@/lib/tag-suggestions';
import { domains } from '@/lib/feed';

export const runtime = 'nodejs';

const liveCache = new Map<
  string,
  { expiresAt: number; retrievedAt: string; suggestions: TagSuggestion[] }
>();

const cleanStrings = (value: unknown, limit: number) =>
  Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter((item) => item.length > 0 && item.length <= 80),
        ),
      ].slice(0, limit)
    : [];

async function handlePOST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError(400, 'INVALID_JSON', 'Expected JSON.');
  }
  const tagIds = cleanStrings(body.tagIds, 12);
  const domainIds = cleanStrings(body.domainIds, 6);
  const customTerms = cleanStrings(body.customTerms, 6);
  const domainTerms =
    tagIds.length || customTerms.length
      ? []
      : domains
          .filter((domain) => domainIds.includes(domain.id))
          .map((domain) => domain.labelEn)
          .slice(0, 2);
  const searchTerms = [...customTerms, ...domainTerms];
  const excludeTerms = cleanStrings(body.excludeTerms, 80);
  const fresh = body.fresh === true;
  const readingLanguage =
    body.readingLanguage === 'zh' || body.readingLanguage === 'en'
      ? body.readingLanguage
      : 'bilingual';
  const seed = seedTagSuggestions(tagIds, domainIds, readingLanguage);
  let live: TagSuggestion[] = [];
  let liveStatus: 'live' | 'degraded' | 'idle' =
    tagIds.length || searchTerms.length ? 'live' : 'idle';
  let warning: string | null = null;
  let retrievedAt: string | null = null;
  if (liveStatus === 'live') {
    try {
      const cacheKey = JSON.stringify({
        account: apiContext.getStore()?.account?.id,
        tagIds,
        domainIds,
        searchTerms,
        excludeTerms,
        readingLanguage,
      });
      const cached = liveCache.get(cacheKey);
      if (!fresh && cached && cached.expiresAt > Date.now()) {
        live = cached.suggestions;
        retrievedAt = cached.retrievedAt;
      } else {
        live = await fetchGithubTagSuggestions(tagIds, searchTerms, readingLanguage, excludeTerms);
        retrievedAt = new Date().toISOString();
        liveCache.set(cacheKey, {
          expiresAt: Date.now() + 10 * 60_000,
          retrievedAt,
          suggestions: live,
        });
      }
    } catch (error) {
      liveStatus = 'degraded';
      warning = error instanceof Error ? error.message : 'LIVE_SUGGESTION_FAILED';
    }
  }
  return apiSuccess(
    {
      suggestions:
        domainIds.length && !tagIds.length && !customTerms.length
          ? [...seed, ...live].slice(0, 16)
          : [...live, ...seed].slice(0, 16),
      liveStatus,
      warning,
      retrievedAt,
      readingLanguage,
      provenance: {
        live: 'Public GitHub repository topics from a current search.',
        seed: 'Bundled taxonomy retained as a deterministic fallback.',
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) { return withAccountContext(handlePOST, false)(request); }
