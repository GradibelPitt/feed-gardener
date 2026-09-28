import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchGoogleScholar,
  parseScholarResults,
  setScholarApiKey,
  scholarConfigured,
} from './crawler/google-scholar.ts';
import { harvestPublicSources } from './crawler/harvest.ts';
import { inferResourceType } from './resources.ts';

const paper = {
  title: 'Agent &amp; tool evaluation',
  link: 'https://example.org/paper',
  snippet: 'A benchmark for coding agents.',
  publication_info: {
    summary: 'A Researcher - Research Journal, 2025',
    authors: [{ name: 'A Researcher' }],
  },
};
const fakeKey = 'scholar-test-key-not-a-real-secret';

test('Scholar keeps paper metadata, safe links and provenance without inventing a full date', () => {
  const items = parseScholarResults(
    [
      paper,
      paper,
      { title: 'Unsafe', link: 'javascript:alert(1)' },
      { title: 'Citation only' },
      { title: 'PDF paper', resources: [{ link: 'https://example.org/paper.pdf' }] },
    ],
    new Date('2026-09-25T12:00:00Z'),
  );
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Agent & tool evaluation');
  assert.equal(items[0].author, 'A Researcher');
  assert.match(items[0].summary, /2025/);
  assert.equal(items[0].publishedAt, null);
  assert.equal(items[0].section, 'academic');
  assert.equal(items[0].provenance.mode, 'public_api');
  assert.equal(items[0].provenance.sourceUrl, 'https://serpapi.com/search.json');
  assert.equal(inferResourceType(items[1].url, items[1].source), 'paper');
});

test('Scholar harvest gates configuration and topics, scopes requests and invalidates changed keys', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.SERPAPI_API_KEY;
  delete process.env.SERPAPI_API_KEY;
  setScholarApiKey(null);
  const requests: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    assert.equal(url.origin, 'https://serpapi.com');
    assert.equal(url.searchParams.get('engine'), 'google_scholar');
    assert.equal(url.searchParams.get('api_key'), fakeKey);
    return Response.json({ organic_results: [paper] });
  };
  try {
    const pending = await harvestPublicSources(true, ['Robotics'], 'Google Scholar');
    assert.equal(pending.health[0].state, 'configuration_required');
    assert.equal(requests.length, 0);
    setScholarApiKey(fakeKey);
    const noTopics = await harvestPublicSources(true, [], 'Google Scholar');
    assert.equal(noTopics.health[0].labelEn, 'Waiting for topics');
    assert.equal(requests.length, 0);
    const result = await harvestPublicSources(false, ['Robotics'], 'Google Scholar');
    assert.equal(result.cache, 'fresh');
    assert.equal(requests.length, 1);
    assert.deepEqual(
      result.health.map((health) => health.source),
      ['Google Scholar'],
    );
    assert.equal(result.sections.academic[0].source, 'Google Scholar');
    assert.equal(result.sections.social.length + result.sections.opensource.length, 0);
    assert.equal(JSON.stringify(result).includes(fakeKey), false);
    assert.equal((await harvestPublicSources(false, ['Robotics'], 'Google Scholar')).cache, 'hit');
    assert.equal(requests.length, 1);
    await fetchGoogleScholar(['Robotics', 'Computer vision', 'ignored']);
    assert.equal(requests[1].searchParams.get('q'), '(Robotics) OR (Computer vision)');
    assert.equal(requests[1].searchParams.get('num'), '20');
    process.env.SERPAPI_API_KEY = fakeKey;
    setScholarApiKey('');
    assert.equal(scholarConfigured(), false);
    assert.equal(
      (await harvestPublicSources(false, ['Robotics'], 'Google Scholar')).health[0].state,
      'configuration_required',
    );
    assert.equal(requests.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    setScholarApiKey(null);
    if (originalEnv === undefined) delete process.env.SERPAPI_API_KEY;
    else process.env.SERPAPI_API_KEY = originalEnv;
  }
});

test('Scholar redacts provider and transport errors and keeps stale results visibly failed', async () => {
  const originalFetch = globalThis.fetch;
  setScholarApiKey(fakeKey);
  try {
    globalThis.fetch = async () => Response.json({ organic_results: [paper] });
    await harvestPublicSources(true, ['Error tests'], 'Google Scholar');
    for (const response of [
      () => new Response(fakeKey, { status: 401 }),
      () => new Response(fakeKey, { status: 429 }),
      () => Response.json({ error: `Provider error ${fakeKey}` }),
      () => new Response(`Invalid JSON ${fakeKey}`),
      () => {
        throw new Error(`Request failed https://serpapi.com/search.json?api_key=${fakeKey}`);
      },
    ]) {
      globalThis.fetch = async () => response();
      const failed = await harvestPublicSources(true, ['Error tests'], 'Google Scholar');
      assert.equal(failed.cache, 'stale_fallback');
      assert.equal(failed.health[0].state, 'error');
      assert.equal(failed.sections.academic.length, 1);
      assert.equal(JSON.stringify(failed).includes(fakeKey), false);
      assert.ok(failed.warnings.length > 0);
    }
    globalThis.fetch = async () => Response.json({ organic_results: [] });
    const empty = await harvestPublicSources(true, ['Error tests'], 'Google Scholar');
    assert.equal(empty.cache, 'fresh');
    assert.equal(empty.health[0].state, 'limited');
    assert.deepEqual(empty.sections.academic, []);
    globalThis.fetch = async () =>
      Response.json({
        search_metadata: { status: 'Success' },
        search_information: { total_results: 0 },
      });
    assert.deepEqual(await fetchGoogleScholar(['No results']), []);
  } finally {
    globalThis.fetch = originalFetch;
    setScholarApiKey(null);
  }
});
