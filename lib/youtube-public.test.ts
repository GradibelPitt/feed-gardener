import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchPublicYouTubeSearchPage, parseYouTubeSearch } from './crawler/youtube-public.ts';

const video = {
  videoRenderer: {
    videoId: 'abcdefghijk',
    title: { runs: [{ text: 'Robot learning' }] },
    ownerText: { simpleText: 'Lab' },
  },
};
const contents = [
  {
    itemSectionRenderer: {
      contents: [video, video, { videoRenderer: { videoId: 'bad', title: { simpleText: 'Bad' } } }],
    },
  },
  {
    continuationItemRenderer: {
      continuationEndpoint: { continuationCommand: { token: 'NEXT%3D' } },
    },
  },
];
const first = {
  contents: {
    twoColumnSearchResultsRenderer: { primaryContents: { sectionListRenderer: { contents } } },
  },
};

test('public search normalizes real video fields without inventing dates or embed permission', () => {
  const parsed = parseYouTubeSearch(first, 'robot learning');
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].title, 'Robot learning');
  assert.equal(parsed.items[0].publishedAt, null);
  assert.equal(parsed.items[0].embedUrl, undefined);
  assert.equal(parsed.items[0].provenance.mode, 'public_api');
  assert.equal(parsed.continuation, 'NEXT%3D');
  assert.throws(() => parseYouTubeSearch({ error: { code: 403 } }, 'robot'), /rejected/);
  assert.throws(() => parseYouTubeSearch({ contents: {} }, 'robot'), /unrecognized/);
});

test('keyless search sends no credentials, continues results, and binds cursors to the query', async () => {
  const before = globalThis.fetch;
  const requests: any[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false');
    assert.deepEqual(init?.headers, { 'Content-Type': 'application/json' });
    requests.push(JSON.parse(String(init?.body)));
    return Response.json(
      requests.length === 1
        ? first
        : {
            onResponseReceivedCommands: [
              { appendContinuationItemsAction: { continuationItems: contents.slice(0, 1) } },
            ],
          },
    );
  };
  try {
    const a = await fetchPublicYouTubeSearchPage(['robot learning']);
    assert.ok(a.nextCursor);
    await assert.rejects(fetchPublicYouTubeSearchPage(['unrelated'], [], a.nextCursor!), /Invalid/);
    const b = await fetchPublicYouTubeSearchPage(['robot learning'], [], a.nextCursor!);
    assert.equal(requests[0].query, 'robot learning');
    assert.equal(requests[1].continuation, 'NEXT%3D');
    assert.equal(b.nextCursor, null);
    assert.equal(b.items.length, 1);
    globalThis.fetch = async () => new Response('blocked', { status: 429 });
    const fallback = await fetchPublicYouTubeSearchPage(['robot learning']);
    assert.equal(fallback.items[0].title, 'Robot learning');
    assert.ok(fallback.cachedAt);
    assert.match(fallback.warning ?? '', /saved results/);
    await assert.rejects(fetchPublicYouTubeSearchPage(['robot']), /HTTP 429/);
    globalThis.fetch = async () => new Response('<html>challenge</html>');
    await assert.rejects(fetchPublicYouTubeSearchPage(['robot']), /non-JSON/);
  } finally {
    globalThis.fetch = before;
  }
});
