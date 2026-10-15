import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArxivFeed } from './crawler/arxiv.ts';
import { classifyDomain, keywordTags } from './crawler/core.ts';
import { parseGithubTrendingRss } from './crawler/github.ts';
import { detectSocialPlatform, SocialResolveError } from './crawler/social.ts';
import { defaultPreferences, matchesHarvestPreferences } from './feed.ts';
import {
  fetchYouTubeSearch,
  fetchYouTubeSearchPage,
  youtubeEmbedUrl,
  setYouTubeSearchApiKey,
} from './crawler/youtube.ts';
import { videoSearchTerms } from './crawler/video-search-terms.ts';
import {
  bilibiliEmbedUrl,
  bilibiliSearchTerms,
  fetchBilibiliSearch,
  fetchBilibiliSearchPage,
} from './crawler/bilibili.ts';

test('classifier keeps vector database content out of the short RAG token false positive', () => {
  const [domain, matches] = classifyDomain(
    'TurboVec: a fast vector index',
    'A vector database with Python bindings, faster than FAISS.',
  );
  assert.equal(domain, '数据与向量库');
  assert.ok(matches.includes('vector index') || matches.includes('vector database'));
});

test('arXiv Atom parser filters old and unrelated records and keeps provenance', () => {
  const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
    <entry><id>https://arxiv.org/abs/2609.12345</id><title>Agent evaluation for code tools</title>
      <summary>A benchmark for tool calling agents.</summary><published>2026-09-19T10:00:00Z</published>
      <author><name>Ada Example</name></author><category term="cs.AI" />
      <link rel="alternate" href="https://arxiv.org/abs/2609.12345" /></entry>
    <entry><id>https://arxiv.org/abs/2201.00001</id><title>Old LLM work</title>
      <summary>language model</summary><published>2022-01-01T00:00:00Z</published></entry>
  </feed>`;
  const items = parseArxivFeed(xml, 14, new Date('2026-09-20T12:00:00Z'));
  assert.equal(items.length, 1);
  assert.equal(items[0].source, 'arXiv');
  assert.equal(items[0].author, 'Ada Example');
  assert.equal(items[0].provenance.mode, 'official_api');
  const preferences = { ...defaultPreferences, onlySelectedTags: true, tags: ['agents'] };
  assert.equal(matchesHarvestPreferences(items[0], preferences), true);
  assert.equal(
    matchesHarvestPreferences(items[0], { ...preferences, blockedTags: ['agents'] }),
    false,
  );
});

test('GitHub RSS parser normalizes repositories and removes markup', () => {
  const xml = `<?xml version="1.0"?><rss><channel><item>
    <title>openai / example</title><link>https://github.com/openai/example</link>
    <description><![CDATA[<p>An agentic developer tool</p>]]></description>
    <pubDate>Sat, 19 Sep 2026 10:00:00 GMT</pubDate>
  </item></channel></rss>`;
  const items = parseGithubTrendingRss(xml, new Date('2026-09-20T12:00:00Z'));
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'openai/example');
  assert.equal(items[0].url, 'https://github.com/openai/example');
  assert.equal(items[0].summary, 'An agentic developer tool');
});

test('social adapter only accepts HTTPS URLs on known platform hosts', () => {
  assert.equal(detectSocialPlatform('https://www.tiktok.com/@a/video/1').platform, 'tiktok');
  assert.equal(detectSocialPlatform('https://x.com/a/status/1').platform, 'x');
  assert.equal(detectSocialPlatform('https://www.instagram.com/p/abc/').platform, 'instagram');
  assert.throws(
    () => detectSocialPlatform('https://x.com.evil.example/status/1'),
    (error) => error instanceof SocialResolveError && error.code === 'HOST_NOT_ALLOWED',
  );
  assert.throws(
    () => detectSocialPlatform('http://x.com/a/status/1'),
    (error) => error instanceof SocialResolveError && error.code === 'HTTPS_REQUIRED',
  );
});

test('YouTube search maps official title and thumbnail and ignores malformed video ids', async () => {
  const before = process.env.YOUTUBE_API_KEY;
  const fetchBefore = globalThis.fetch;
  setYouTubeSearchApiKey('test-key');
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'www.googleapis.com');
    if (url.pathname.endsWith('/videos'))
      return Response.json({
        items: [
          {
            id: 'abcdefghijk',
            status: { embeddable: true, madeForKids: false },
            contentDetails: { duration: 'PT1M30S' },
          },
        ],
      });
    assert.equal(url.searchParams.get('q'), 'Robotics');
    return Response.json({
      items: [
        {
          id: { videoId: 'abcdefghijk' },
          snippet: {
            title: 'Robot demo',
            description: 'Robotics',
            channelTitle: 'Lab',
            thumbnails: { medium: { url: 'https://i.ytimg.com/example.jpg' } },
          },
        },
        { id: { videoId: 'invalid' }, snippet: { title: 'Ignore me' } },
      ],
    });
  };
  try {
    const items = await fetchYouTubeSearch(['Robotics']);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Robot demo');
    assert.equal(items[0].imageUrl, 'https://i.ytimg.com/example.jpg');
    assert.equal(items[0].durationSeconds, 90);
    assert.equal(
      items[0].embedUrl,
      'https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=0',
    );
    assert.equal(items[0].provenance.mode, 'official_api');
    assert.equal(youtubeEmbedUrl('https://youtu.be/abcdefghijk'), items[0].embedUrl);
    assert.equal(youtubeEmbedUrl('https://youtube.com.evil.example/watch?v=abcdefghijk'), null);
  } finally {
    globalThis.fetch = fetchBefore;
    setYouTubeSearchApiKey(null);
    if (before === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = before;
  }
});

test('AI video search rotates through specific terms and keeps YouTube pagination', async () => {
  const before = process.env.YOUTUBE_API_KEY;
  const fetchBefore = globalThis.fetch;
  setYouTubeSearchApiKey('test-key');
  const queries: Array<[string | null, string | null]> = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/videos'))
      return Response.json({
        items: [{ id: 'abcdefghijk', status: { embeddable: true, madeForKids: false } }],
      });
    queries.push([url.searchParams.get('q'), url.searchParams.get('pageToken')]);
    return Response.json({
      items: [
        { id: { videoId: 'abcdefghijk' }, snippet: { title: 'Claude and AI', description: '' } },
      ],
      ...(queries.length === 1 ? { nextPageToken: 'NEXT_PAGE' } : {}),
    });
  };
  try {
    assert.deepEqual(videoSearchTerms(['AI']).slice(0, 4), ['AI', 'Claude', 'OpenAI', 'DeepSeek']);
    const first = await fetchYouTubeSearchPage(['AI']);
    assert.equal(first.items.length, 1);
    assert.ok(first.nextCursor);
    const second = await fetchYouTubeSearchPage(['AI'], [], first.nextCursor!);
    assert.equal(second.items[0]?.id, first.items[0]?.id);
    assert.deepEqual(queries, [
      ['AI', null],
      ['Claude', null],
    ]);
  } finally {
    globalThis.fetch = fetchBefore;
    setYouTubeSearchApiKey(null);
    if (before === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = before;
  }
});

test('Bilibili continues each tag with an older publication date window', async () => {
  assert.ok(keywordTags('Claude tutorial').includes('AI'));
  assert.ok(keywordTags('DeepSeek overview').includes('AI'));
  const before = globalThis.fetch;
  const dateBounds: Array<string | null> = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const dateBound = url.searchParams.get('pubtime_end_s');
    dateBounds.push(dateBound);
    assert.equal(url.searchParams.get('page'), '1');
    assert.equal(url.searchParams.get('order'), 'pubdate');
    if (dateBound) assert.equal(url.searchParams.get('pubtime_begin_s'), '1');
    return Response.json({
      code: 0,
      data: {
        result:
          dateBound === '1599999999'
            ? []
            : [
                {
                  bvid: dateBound ? 'BV1pYaA6FE5U' : 'BV1pYaA6FE5T',
                  title: 'Claude AI',
                  description: '',
                  author: 'Lab',
                  pubdate: dateBound ? 1600000000 : 1790000000,
                },
              ],
      },
    });
  };
  try {
    const first = await fetchBilibiliSearchPage(['AI'], ['人工智能']);
    assert.equal(first.items.length, 1);
    assert.ok(first.nextCursor);
    const second = await fetchBilibiliSearchPage(['AI'], ['人工智能'], first.nextCursor!);
    assert.equal(second.items.length, 1);
    assert.ok(second.nextCursor);
    assert.notEqual(first.items[0].id, second.items[0].id);
    const third = await fetchBilibiliSearchPage(['AI'], ['人工智能'], second.nextCursor!);
    assert.equal(third.items.length, 0);
    assert.equal(third.nextCursor, null);
    assert.ok(dateBounds.includes('1789999999'));
    assert.ok(dateBounds.includes('1599999999'));
  } finally {
    globalThis.fetch = before;
  }
});

test('Bilibili searches both language labels and deduplicates video cards', async () => {
  const before = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requested.push(url.searchParams.get('keyword') ?? '');
    assert.equal(url.pathname, '/x/web-interface/wbi/search/type');
    return Response.json({
      code: 0,
      data: {
        result: [
          {
            bvid: 'BV1pYaA6FE5T',
            title: '<em class="keyword">机器人</em>与 AI',
            description: '人工智能演示',
            author: '研究者',
            pic: '//i1.hdslb.com/bfs/archive/example.jpg',
            tag: '机器人,人工智能,AI',
            duration: '1:30',
            pubdate: 1790253000,
          },
        ],
      },
    });
  };
  try {
    assert.deepEqual(bilibiliSearchTerms(['Robotics']), ['Robotics', '机器人']);
    assert.deepEqual(bilibiliSearchTerms(['AI'], ['人工智能']), ['AI', '人工智能']);
    const items = await fetchBilibiliSearch(['AI'], ['人工智能']);
    assert.deepEqual(requested.sort(), ['AI', '人工智能'].sort());
    assert.equal(items.length, 1);
    assert.equal(items[0].title, '机器人 与 AI');
    assert.equal(items[0].imageUrl, 'https://i1.hdslb.com/bfs/archive/example.jpg');
    assert.equal(items[0].embedUrl, bilibiliEmbedUrl('BV1pYaA6FE5T'));
    assert.equal(items[0].durationSeconds, 90);
    assert.equal(items[0].provenance.mode, 'public_api');
    assert.equal(bilibiliEmbedUrl('BV1pYaA6FE5T&autoplay=1'), null);
    assert.equal(
      matchesHarvestPreferences(items[0], {
        ...defaultPreferences,
        tags: [],
        customTags: [
          {
            id: 'ai',
            label: 'AI',
            labelEn: 'AI',
            labelZh: '人工智能',
            translationStatus: 'translated',
            source: 'github_live',
            evidenceUrl: 'https://github.com/example/ai',
          },
        ],
        onlySelectedTags: true,
      }),
      true,
    );
  } finally {
    globalThis.fetch = before;
  }
});

test('Bilibili stops searching when its public API requires verification', async () => {
  const before = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    requested.push(new URL(String(input)).searchParams.get('keyword') ?? '');
    return Response.json({ code: 0, data: { v_voucher: 'voucher_example' } });
  };
  try {
    await assert.rejects(
      fetchBilibiliSearchPage(['AI'], ['人工智能']),
      /Bilibili requires verification for this connection/,
    );
    assert.deepEqual(requested, ['AI']);
  } finally {
    globalThis.fetch = before;
  }
});

test('Bilibili uses its public app search when web search blocks the hosted site', async () => {
  const before = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push(`${url.hostname}${url.pathname}?${url.searchParams.get('pn') ?? 'web'}`);
    if (url.hostname === 'api.bilibili.com') {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('origin'), null);
      assert.equal(headers.get('sec-fetch-site'), null);
      assert.equal(headers.get('referer'), 'https://search.bilibili.com/all?keyword=Robot%20demo');
      return new Response(null, { status: 412 });
    }
    assert.equal(url.hostname, 'app.bilibili.com');
    assert.equal(url.searchParams.get('order'), 'pubdate');
    const page = Number(url.searchParams.get('pn'));
    return Response.json({
      code: 0,
      data: {
        item: Array.from({ length: page === 1 ? 20 : 1 }, (_, index) => ({
          goto: 'av',
          title: `Robot demo ${index}`,
          author: 'Lab',
          cover: 'https://i0.hdslb.com/example.jpg',
          ptime: 1790373000 - index - page * 20,
          duration: 75,
          share: { video: { bvid: `BV${String((page - 1) * 20 + index).padStart(10, '0')}` } },
        })),
      },
    });
  };
  try {
    const first = await fetchBilibiliSearchPage(['Robot demo']);
    assert.equal(first.items.length, 20);
    assert.equal(first.items[0].provenance.sourceUrl, 'https://app.bilibili.com/x/v2/search');
    assert.equal(first.items[0].durationSeconds, 75);
    assert.ok(first.nextCursor);
    const second = await fetchBilibiliSearchPage(['Robot demo'], [], first.nextCursor!);
    assert.equal(second.items.length, 1);
    assert.equal(second.nextCursor, null);
    assert.deepEqual(requests, [
      'api.bilibili.com/x/web-interface/wbi/search/type?web',
      'app.bilibili.com/x/v2/search?1',
      'app.bilibili.com/x/v2/search?2',
    ]);
  } finally {
    globalThis.fetch = before;
  }
});

test('Bilibili keeps valid results when one language search fails', async () => {
  const before = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    const term = new URL(String(input)).searchParams.get('keyword') ?? '';
    requested.push(term);
    if (term === 'AI') return new Response(null, { status: 503 });
    return Response.json({
      code: 0,
      data: { result: [{ bvid: 'BV1pYaA6FE5T', title: '人工智能' }] },
    });
  };
  try {
    const result = await fetchBilibiliSearchPage(['AI'], ['人工智能']);
    assert.deepEqual(requested, ['AI', '人工智能']);
    assert.equal(result.items.length, 1);
  } finally {
    globalThis.fetch = before;
  }
});
