import { readApiData } from './api-contract.ts';
import { domains, searchInterests, matchesHarvestPreferences, type Preferences } from './feed.ts';
import type { HarvestItem, HarvestPayload } from './crawler/types.ts';
import { matchesJevRelevance, type JevRating } from './feed-simulator.ts';
import type { TagSuggestion } from './tag-suggestions.ts';
import { videoId } from './short-video.ts';

export type ShortVideo = {
  item: HarvestItem;
  topic: string;
  reason: 'interest' | 'broader' | 'nearby' | 'unrated';
  rating?: JevRating;
};
type Topic = { labelEn: string; labelZh: string };
type Lane = { topic: Topic; cursor?: string | null; pending: HarvestItem[]; nearby: boolean };
type SuggestionResult = { suggestions: TagSuggestion[]; liveStatus: string };

/** Session-local relaxation: never changes the saved relevance threshold or interests. */
export class ShortVideoSession {
  private preferences: Preferences;
  private request: typeof fetch;
  private selected: Lane[];
  private nearby: Lane[] = [];
  private strong: ShortVideo[] = [];
  private broad: ShortVideo[] = [];
  private seen = new Set<string>();
  private topics = new Set<string>();
  private selectedIndex = 0;
  private nearbyIndex = 0;
  private suggestionIndex = 0;
  private expanded = false;
  private scoringUnavailable = false;
  warning = '';
  private goals: string[];
  private searching: boolean;

  constructor(preferences: Preferences, request: typeof fetch = fetch, query = '') {
    this.preferences = preferences;
    this.request = request.bind(globalThis);
    this.searching = !!query.trim();
    const interests = this.searching
      ? [{ labelEn: query.trim(), labelZh: query.trim() }]
      : searchInterests({
          ...preferences,
          tags: preferences.tags.filter((id) => !preferences.blockedTags.includes(id)),
        });
    this.selected = interests.map((topic) => ({ topic, pending: [], nearby: false }));
    this.goals = interests.map((topic) => topic.labelEn.slice(0, 80)).slice(0, 12);
    interests.forEach((topic) => this.topics.add(topic.labelEn.toLowerCase()));
  }

  private async json<T>(url: string, signal: AbortSignal, init: RequestInit = {}): Promise<T> {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(18000)]);
    return readApiData<T>(
      await this.request(url, { ...init, signal: deadline, cache: 'no-store' }),
    );
  }

  private async score(item: HarvestItem, signal: AbortSignal): Promise<JevRating | undefined> {
    if (this.scoringUnavailable) return undefined;
    try {
      const response = await this.request('/api/agent/v1/decisions/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.any([signal, AbortSignal.timeout(7000)]),
        body: JSON.stringify({
          platform: 'feeder',
          contentTitle: item.title,
          goalTags: this.goals,
          remainingVideoBudget: 1,
          remainingMinuteBudget: 1,
          provider: 'jev',
        }),
      });
      if (response.status === 503) this.scoringUnavailable = true;
      const { decision } = await readApiData<{
        decision: { provider: string; relevanceScore: number | null; confidence: number | null };
      }>(response);
      if (
        decision.provider === 'jev' &&
        decision.relevanceScore !== null &&
        decision.confidence !== null &&
        Number.isFinite(decision.relevanceScore) &&
        decision.relevanceScore >= 0 &&
        decision.relevanceScore <= 10 &&
        Number.isFinite(decision.confidence) &&
        decision.confidence >= 0 &&
        decision.confidence <= 1
      )
        return { score: decision.relevanceScore, confidence: decision.confidence };
    } catch {
      if (signal.aborted) throw signal.reason;
    }
    this.warning =
      'Relevance scoring is unavailable for some videos; continuing with topic search results.';
    return undefined;
  }

  private async fill(lane: Lane, signal: AbortSignal): Promise<ShortVideo[]> {
    if (!lane.pending.length && lane.cursor !== null) {
      const query = new URLSearchParams({
        source: 'YouTube',
        tag: lane.topic.labelEn,
        refresh: 'true',
      });
      if (lane.cursor) query.set('cursor', lane.cursor);
      const data = await this.json<HarvestPayload>(`/api/harvest?${query}`, signal);
      const health = data.health.find((entry) => entry.source === 'YouTube');
      if (health?.state === 'error' || health?.state === 'configuration_required')
        throw new Error('Video search is temporarily unavailable. Try again.');
      if (data.warnings.length) this.warning = data.warnings.join(' ');
      const next = data.nextCursors?.YouTube ?? data.nextCursor ?? null;
      lane.cursor = next === lane.cursor ? null : next;
      const relaxed = {
        ...this.preferences,
        onlySelectedTags: false,
        requireAllSelectedTags: false,
        excludeUnselectedTags: false,
      };
      lane.pending.push(
        ...data.sections.social.filter((item) => {
          const id = videoId(item.url);
          if (
            item.source !== 'YouTube' ||
            !id ||
            this.seen.has(id) ||
            !matchesHarvestPreferences(item, relaxed)
          )
            return false;
          // Official search explicitly omits embeds for videos that cannot be embedded.
          if (item.provenance.mode === 'official_api' && !item.embedUrl) return false;
          this.seen.add(id);
          return true;
        }),
      );
    }
    const batch = lane.pending.slice(0, 8);
    const entries = await Promise.all(
      batch.map(async (item): Promise<ShortVideo> => {
        const rating = await this.score(item, signal);
        return {
          item,
          topic: lane.topic.labelEn,
          rating,
          reason: lane.nearby
            ? 'nearby'
            : matchesJevRelevance(rating, this.preferences.targetJevAverage ?? 8)
              ? 'interest'
              : rating
                ? 'broader'
                : 'unrated',
        };
      }),
    );
    if (signal.aborted) throw signal.reason;
    lane.pending.splice(0, batch.length);
    return entries.sort((a, b) => (b.rating?.score ?? -1) - (a.rating?.score ?? -1));
  }

  private async expand(signal: AbortSignal) {
    if (this.suggestionIndex >= this.selected.length) return;
    const seed = this.selected[this.suggestionIndex].topic;
    const known = domains
      .flatMap((domain) => domain.tags)
      .find((tag) => tag.labelEn === seed.labelEn);
    const data = await this.json<SuggestionResult>('/api/tags/suggest', signal, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tagIds: known ? [known.id] : [],
        domainIds: [],
        customTerms: known ? [] : [seed.labelEn],
        excludeTerms: [...this.topics].slice(-80),
        readingLanguage: 'en',
      }),
    });
    this.suggestionIndex++;
    for (const topic of data.suggestions) {
      const key = topic.labelEn.toLowerCase().trim();
      if (
        !key ||
        this.topics.has(key) ||
        (topic.knownTagId && this.preferences.blockedTags.includes(topic.knownTagId))
      )
        continue;
      this.topics.add(key);
      this.nearby.push({
        topic: { labelEn: topic.labelEn, labelZh: topic.label },
        pending: [],
        nearby: true,
      });
    }
  }

  async next(signal: AbortSignal): Promise<ShortVideo[]> {
    this.warning = '';
    // Probe a bounded number of pages; empty/duplicate upstream pages cannot cause a request loop.
    const probeSelected = this.broad.length < 8;
    for (let attempt = 0; attempt < 2 && this.strong.length < 4 && probeSelected; attempt++) {
      const lanes = this.selected.filter((lane) => lane.pending.length || lane.cursor !== null);
      if (!lanes.length) break;
      const lane = lanes[this.selectedIndex++ % lanes.length];
      let batch: ShortVideo[];
      try {
        batch = await this.fill(lane, signal);
      } catch (error) {
        if (signal.aborted) throw error;
        this.warning = 'Some video searches failed. Continuing with available videos.';
        continue;
      }
      this.strong.push(...batch.filter((entry) => entry.reason === 'interest'));
      this.broad.push(...batch.filter((entry) => entry.reason !== 'interest'));
      if (this.strong.length >= 4) break;
    }
    const result = this.strong.splice(0, 4);
    if (result.length < 4) {
      const allowNearby = !this.searching && this.preferences.shortsNearbyTopics !== false;
      const wasExpanded = this.expanded;
      this.expanded = true;
      // Lower-relevance results bridge the first shortage. Then reserve a slot for nearby topics.
      result.push(
        ...this.broad.splice(0, Math.max(0, (wasExpanded && allowNearby ? 3 : 4) - result.length)),
      );
      if (result.length < 4 && allowNearby) {
        let lanes = this.nearby.filter((lane) => lane.pending.length || lane.cursor !== null);
        if (!lanes.length) {
          try {
            await this.expand(signal);
          } catch {
            if (signal.aborted) throw signal.reason;
            this.warning = 'Nearby topics could not load. Pull in more videos by refreshing.';
          }
          lanes = this.nearby.filter((lane) => lane.pending.length || lane.cursor !== null);
        }
        if (lanes.length) {
          try {
            const batch = await this.fill(lanes[this.nearbyIndex++ % lanes.length], signal);
            result.push(...batch.splice(0, 4 - result.length));
            this.broad.push(...batch);
          } catch (error) {
            if (signal.aborted) throw error;
            this.warning =
              'Nearby video search is temporarily unavailable. Continuing with available clips.';
          }
        }
        result.push(...this.broad.splice(0, 4 - result.length));
      }
    }
    return result;
  }
}
