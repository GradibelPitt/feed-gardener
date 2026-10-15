import assert from 'node:assert/strict';
import test from 'node:test';
import { middleClip, parseVideoDuration } from './short-video.ts';
import { ShortVideoSession } from './short-video-feed.ts';
import { defaultPreferences } from './feed.ts';
import type { HarvestItem } from './crawler/types.ts';

test('clip boundaries stay centered, bounded and valid across durations', () => {
  assert.deepEqual(middleClip(30), { start: 0, end: 30, duration: 30 });
  assert.deepEqual(middleClip(120), { start: 45, end: 75, duration: 30 });
  assert.deepEqual(middleClip(600), { start: 270, end: 330, duration: 60 });
  for (let total = 1; total <= 10000; total++) {
    const clip = middleClip(total)!;
    assert.ok(clip.start >= 0 && clip.end <= total && clip.duration <= 60);
    assert.ok(Math.abs((clip.start + clip.end) / 2 - total / 2) <= 0.5);
  }
  for (const invalid of [undefined, 0, -1, NaN, Infinity]) assert.equal(middleClip(invalid), null);
  assert.equal(parseVideoDuration('1:02:03'), 3723);
  assert.equal(parseVideoDuration('14:29'), 869);
  for (const invalid of ['LIVE', '', '2:99', '0:00'])
    assert.equal(parseVideoDuration(invalid), undefined);
});

const prefs = {
  ...defaultPreferences,
  domains: ['ai-infrastructure'],
  tags: ['agents'],
  customTags: [],
  blockedTags: [],
  blockedSources: [],
  targetJevAverage: 8,
  onlySelectedTags: true,
  requireAllSelectedTags: true,
  excludeUnselectedTags: true,
};
const item = (index: number, high = false): HarvestItem => ({
  id: `youtube-${String(index).padStart(11, '0')}`,
  section: 'social',
  source: 'YouTube',
  title: `${high ? 'High' : 'Low'} ${index}`,
  url: `https://www.youtube.com/watch?v=${String(index).padStart(11, '0')}`,
  author: 'Creator',
  summary: '',
  tags: ['Agent'],
  domain: 'ai-infrastructure',
  domainKeywords: [],
  publishedAt: null,
  durationSeconds: 600,
  provenance: {
    mode: 'public_api',
    sourceUrl: 'https://youtube.com',
    fetchedAt: new Date().toISOString(),
  },
});
const ok = (data: unknown) =>
  Response.json({ data, meta: { contractVersion: 'feed-gardener-api/2' } });
const payload = (items: HarvestItem[], next: string | null = null) =>
  ok({
    sections: { social: items, academic: [], opensource: [] },
    health: [],
    warnings: [],
    nextCursor: next,
  });

test('Shorts relaxes only after strong picks run low, then automatically expands nearby topics without changing preferences', async () => {
  const before = JSON.stringify(prefs);
  const queries: string[] = [];
  let suggests = 0;
  const mock: typeof fetch = async (url, init) => {
    if (String(url).includes('decisions')) {
      const body = JSON.parse(String(init?.body));
      return ok({
        decision: {
          provider: 'jev',
          relevanceScore: body.contentTitle.startsWith('High') ? 9 : 4,
          confidence: 0.95,
        },
      });
    }
    if (String(url).includes('suggest')) {
      suggests++;
      return ok({
        suggestions: [
          { labelEn: 'Robot learning', label: '机器人学习' },
          { labelEn: 'Agents', label: '智能体' },
        ],
        liveStatus: 'live',
      });
    }
    const query = new URL(String(url), 'http://localhost').searchParams.get('tag')!;
    queries.push(query);
    return payload(
      query === 'Agents'
        ? Array.from({ length: 8 }, (_, i) => item(i, i < 5))
        : [item(10), item(11)],
    );
  };
  const session = new ShortVideoSession(prefs, mock);
  const signal = new AbortController().signal;
  const first = await session.next(signal);
  assert.equal(first.length, 4);
  assert.ok(first.every((entry) => entry.reason === 'interest'));
  assert.equal(suggests, 0);
  const second = await session.next(signal);
  assert.equal(second[0].reason, 'interest');
  assert.equal(second.filter((entry) => entry.reason === 'broader').length, 3);
  const third = await session.next(signal);
  assert.ok(third.some((entry) => entry.reason === 'nearby'));
  assert.deepEqual(queries, ['Agents', 'Robot learning']);
  assert.equal(
    new Set([...first, ...second, ...third].map((entry) => entry.item.id)).size,
    first.length + second.length + third.length,
  );
  assert.equal(JSON.stringify(prefs), before);
});

for (const enabled of [false, true, undefined]) {
  test(`Shorts nearby preference ${enabled}: controls suggestions and nearby video requests`, async () => {
    const queries: string[] = [];
    let suggestions = 0;
    const mock: typeof fetch = async (url) => {
      if (String(url).includes('decisions'))
        return ok({ decision: { provider: 'jev', relevanceScore: 4, confidence: 0.95 } });
      if (String(url).includes('suggest')) {
        suggestions++;
        return ok({ suggestions: [{ labelEn: 'Robot learning', label: '机器人学习' }] });
      }
      const topic = new URL(String(url), 'http://localhost').searchParams.get('tag')!;
      queries.push(topic);
      return payload(
        topic === 'Agents' ? Array.from({ length: 9 }, (_, i) => item(i)) : [item(100)],
      );
    };
    const session = new ShortVideoSession({ ...prefs, shortsNearbyTopics: enabled }, mock);
    const signal = new AbortController().signal;
    const results = [];
    for (let i = 0; i < 5; i++) results.push(...(await session.next(signal)));
    assert.equal(results.filter((entry) => entry.topic === 'Agents').length, 9);
    if (enabled === false) {
      assert.equal(suggestions, 0);
      assert.deepEqual(queries, ['Agents']);
      assert.ok(results.every((entry) => entry.reason !== 'nearby'));
    } else {
      assert.equal(suggestions, 1);
      assert.deepEqual(queries, ['Agents', 'Robot learning']);
      assert.equal(results.filter((entry) => entry.reason === 'nearby').length, 1);
    }
  });
}

test('unknown scores remain unrated; duplicate pages are bounded and source blocks still apply', async () => {
  let calls = 0;
  const mock: typeof fetch = async (url) => {
    if (String(url).includes('decisions')) return new Response('', { status: 503 });
    if (String(url).includes('suggest')) return ok({ suggestions: [], liveStatus: 'degraded' });
    calls++;
    return payload([item(1), item(1)], `cursor${calls}`);
  };
  const session = new ShortVideoSession(prefs, mock);
  const result = await session.next(new AbortController().signal);
  assert.equal(result.length, 1);
  assert.equal(result[0].reason, 'unrated');
  assert.equal(result[0].rating, undefined);
  assert.equal((await session.next(new AbortController().signal)).length, 0);
  assert.ok(calls <= 4);
  const blocked = new ShortVideoSession({ ...prefs, blockedSources: ['YouTube'] }, mock);
  assert.equal((await blocked.next(new AbortController().signal)).length, 0);
});

test('search or nearby failures preserve already buffered clips', async () => {
  let calls = 0;
  const mock: typeof fetch = async (url) => {
    if (String(url).includes('decisions'))
      return ok({ decision: { provider: 'jev', relevanceScore: 4, confidence: 0.95 } });
    if (String(url).includes('suggest'))
      return ok({ suggestions: [{ labelEn: 'Robotics', label: '机器人' }] });
    calls++;
    if (calls > 1) throw new Error('offline');
    return payload(
      Array.from({ length: 7 }, (_, i) => item(i)),
      'next',
    );
  };
  const session = new ShortVideoSession(prefs, mock);
  const signal = new AbortController().signal;
  assert.equal((await session.next(signal)).length, 4);
  assert.equal((await session.next(signal)).length, 3);
  assert.match(session.warning, /unavailable/);
});

test('explicit video search uses the query without expanding topics or changing saved interests', async () => {
  const before = JSON.stringify(prefs);
  const queries: string[] = [];
  const goals: string[][] = [];
  let suggestions = 0;
  const mock: typeof fetch = async (url, init) => {
    if (String(url).includes('decisions')) {
      goals.push(JSON.parse(String(init?.body)).goalTags);
      return ok({ decision: { provider: 'jev', relevanceScore: 4, confidence: 0.95 } });
    }
    if (String(url).includes('suggest')) {
      suggestions++;
      return ok({ suggestions: [] });
    }
    queries.push(new URL(String(url), 'http://localhost').searchParams.get('tag')!);
    return payload([item(1)]);
  };
  const session = new ShortVideoSession(prefs, mock, ' Ocean life ');
  const signal = new AbortController().signal;
  const results = await session.next(signal);
  assert.equal(results.length, 1);
  assert.equal(results[0].topic, 'Ocean life');
  assert.deepEqual(await session.next(signal), []);
  assert.deepEqual(queries, ['Ocean life']);
  assert.deepEqual(goals, [['Ocean life']]);
  assert.equal(suggestions, 0);
  assert.equal(JSON.stringify(prefs), before);
});
