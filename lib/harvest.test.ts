import assert from 'node:assert/strict';
import test from 'node:test';
import { harvestPublicSources } from './crawler/harvest.ts';
import { appendHarvestPayload, mergeHarvestPayload } from './crawler/merge.ts';
import {
  setYouTubeSearchApiKey,
  youtubeSearchConfigured,
  youtubeSearchKeyRevision,
} from './crawler/youtube.ts';

test('a scoped harvest contacts only the selected public source', async () => {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    requested.push(String(input));
    return new Response(
      `<?xml version="1.0"?><rss><channel><item>
      <title>example / project</title><link>https://github.com/example/project</link>
      <description>Agent developer tool</description>
      <pubDate>Sat, 19 Sep 2026 10:00:00 GMT</pubDate>
    </item></channel></rss>`,
      { status: 200 },
    );
  };
  try {
    const payload = await harvestPublicSources(true, [], 'GitHub');
    assert.equal(requested.length, 1);
    assert.match(requested[0], /GitHubTrendingRSS/);
    assert.deepEqual(payload.sections.social, []);
    assert.deepEqual(payload.sections.academic, []);
    assert.equal(payload.sections.opensource[0]?.source, 'GitHub');
    assert.deepEqual(
      payload.health.map((health) => health.source),
      ['GitHub'],
    );

    requested.length = 0;
    const social = await harvestPublicSources(true, [], 'TikTok');
    assert.deepEqual(requested, [], 'a URL-only platform must not crawl without a post URL');
    assert.deepEqual(
      social.health.map((health) => health.source),
      ['TikTok'],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('scoped results replace one source while retaining other fetched sections', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('GitHubTrendingRSS')) {
      return new Response(
        `<?xml version="1.0"?><rss><channel><item>
        <title>example / project</title><link>https://github.com/example/project</link>
        <description>Agent developer tool</description>
      </item></channel></rss>`,
        { status: 200 },
      );
    }
    if (url.endsWith('/beststories.json')) return Response.json([123]);
    if (url.endsWith('/item/123.json'))
      return Response.json({ id: 123, type: 'story', title: 'Agent test', by: 'alice' });
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const github = await harvestPublicSources(true, [], 'GitHub');
    const hackerNews = await harvestPublicSources(true, [], 'Hacker News');
    const merged = mergeHarvestPayload(github, hackerNews);
    assert.deepEqual(
      merged.sections.opensource.map((item) => item.source),
      ['GitHub', 'Hacker News'],
    );
    assert.deepEqual(
      merged.health.map((health) => health.source),
      ['GitHub', 'Hacker News'],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('video pages append in order and duplicate video IDs do not reappear', () => {
  const item = (id: string) => ({
    id,
    section: 'social' as const,
    source: 'YouTube' as const,
    title: id,
    summary: '',
    author: '',
    url: `https://www.youtube.com/watch?v=${id}`,
    publishedAt: null,
    tags: ['YouTube'],
    domain: 'Technology',
    domainKeywords: [],
    provenance: {
      mode: 'official_api' as const,
      sourceUrl: 'https://www.googleapis.com/youtube/v3/search',
      fetchedAt: '',
    },
  });
  const base = {
    generatedAt: '',
    cache: 'fresh' as const,
    sections: { social: [item('video-one'), item('video-two')], academic: [], opensource: [] },
    health: [
      {
        source: 'YouTube' as const,
        section: 'social' as const,
        state: 'live' as const,
        label: '',
        labelEn: '',
        detail: '',
        detailEn: '',
        itemCount: 2,
      },
    ],
    warnings: [],
    nextCursor: 'next',
  };
  const incoming = {
    ...base,
    sections: { ...base.sections, social: [item('video-two'), item('video-three')] },
    nextCursor: null,
  };
  const merged = appendHarvestPayload(base, incoming);
  assert.deepEqual(
    merged.sections.social.map((video) => video.id),
    ['video-one', 'video-two', 'video-three'],
  );
  assert.equal(merged.health[0]?.itemCount, 3);
  assert.equal(merged.nextCursor, null);
});

test('YouTube videos rejected by the Shorts duration setting remain in the Discover pool', async () => {
  const originalFetch = globalThis.fetch;
  setYouTubeSearchApiKey('test-key');
  let searches = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/search')) {
      searches++;
      const id = searches === 1 ? 'abcdefghijk' : 'lmnopqrstuv';
      return Response.json({
        items: [{ id: { videoId: id }, snippet: { title: `Video ${searches}` } }],
      });
    }
    const id = url.searchParams.get('id');
    return Response.json({
      items: [
        {
          id,
          status: { embeddable: true, madeForKids: false },
          contentDetails: { duration: searches === 1 ? 'PT10M' : 'PT30S' },
        },
      ],
    });
  };
  try {
    const shortsFetch = await harvestPublicSources(true, ['ShortsPoolTest'], 'YouTube');
    assert.equal(shortsFetch.sections.social[0]?.durationSeconds, 600);
    const discoverFetch = await harvestPublicSources(
      true,
      ['ShortsPoolTest'],
      'YouTube',
      [],
      undefined,
      true,
    );
    assert.deepEqual(
      discoverFetch.sections.social.map((item) => item.durationSeconds).sort((a, b) => a! - b!),
      [30, 600],
    );
    assert.equal(searches, 2);
  } finally {
    setYouTubeSearchApiKey(null);
    globalThis.fetch = originalFetch;
  }
});

test('Bilibili videos remain available to Discover after the Shorts duration filter', async () => {
  const originalFetch = globalThis.fetch;
  let searches = 0;
  globalThis.fetch = async () => {
    searches++;
    return Response.json({
      code: 0,
      data: {
        result: [
          {
            bvid: searches === 1 ? 'BV1pYaA6FE5T' : 'BV1pYaA6FE5U',
            title: `Video ${searches}`,
            duration: searches === 1 ? '10:00' : '0:30',
          },
        ],
      },
    });
  };
  try {
    const shortsFetch = await harvestPublicSources(true, ['BiliPoolTest'], 'Bilibili');
    assert.equal(shortsFetch.sections.social[0]?.durationSeconds, 600);
    const discoverFetch = await harvestPublicSources(
      true,
      ['BiliPoolTest'],
      'Bilibili',
      [],
      undefined,
      true,
    );
    assert.deepEqual(
      discoverFetch.sections.social.map((item) => item.durationSeconds).sort((a, b) => a! - b!),
      [30, 600],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('entering an optional YouTube key switches from public search and invalidates its snapshot', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnvKey = process.env.YOUTUBE_API_KEY;
  const fakeKey = `AIza${'a'.repeat(35)}`;
  const requests: string[] = [];
  delete process.env.YOUTUBE_API_KEY;
  setYouTubeSearchApiKey(null);
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push(url.pathname);
    assert.equal(url.searchParams.has('key'), false);
    if (url.hostname === 'www.youtube.com') {
      assert.equal(new Headers(init?.headers).has('x-goog-api-key'), false);
      return Response.json({
        contents: {
          twoColumnSearchResultsRenderer: {
            primaryContents: { sectionListRenderer: { contents: [] } },
          },
        },
      });
    }
    assert.equal(new Headers(init?.headers).get('x-goog-api-key'), fakeKey);
    return Response.json({ items: [] });
  };
  try {
    const before = await harvestPublicSources(true, ['Robotics'], 'YouTube');
    assert.equal(before.health[0]?.state, 'limited');
    assert.equal(requests.length, 1);
    const revision = youtubeSearchKeyRevision();
    setYouTubeSearchApiKey(fakeKey);
    assert.equal(youtubeSearchConfigured(), true);
    assert.equal(youtubeSearchKeyRevision(), revision + 1);
    const after = await harvestPublicSources(false, ['Robotics'], 'YouTube');
    assert.equal(after.cache, 'fresh');
    assert.deepEqual(requests, ['/youtubei/v1/search', '/youtube/v3/search']);
    assert.equal(JSON.stringify(after).includes(fakeKey), false);
    globalThis.fetch = async () => {
      throw new Error(`Request failed at URL containing ${fakeKey}`);
    };
    const failed = await harvestPublicSources(true, ['Robotics'], 'YouTube');
    assert.equal(failed.health[0]?.state, 'error');
    assert.equal(JSON.stringify(failed).includes(fakeKey), false);
  } finally {
    setYouTubeSearchApiKey(null);
    globalThis.fetch = originalFetch;
    if (originalEnvKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = originalEnvKey;
  }
});

test('clearing a session YouTube key leaves keyless search available', async () => {
  const originalEnvKey = process.env.YOUTUBE_API_KEY;
  process.env.YOUTUBE_API_KEY = `AIza${'b'.repeat(35)}`;
  try {
    setYouTubeSearchApiKey(`AIza${'a'.repeat(35)}`);
    assert.equal(youtubeSearchConfigured(), true);
    const previousRevision = youtubeSearchKeyRevision();
    setYouTubeSearchApiKey('');
    assert.equal(youtubeSearchConfigured(), true);
    assert.equal(youtubeSearchKeyRevision(), previousRevision + 1);
    const payload = await harvestPublicSources(true, [], 'YouTube');
    assert.equal(payload.health[0]?.state, 'limited');
  } finally {
    setYouTubeSearchApiKey(null);
    if (originalEnvKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = originalEnvKey;
  }
});
