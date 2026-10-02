import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchFreeAcademic, parseAcademicResults } from './crawler/academic.ts';
import { harvestPublicSources } from './crawler/harvest.ts';
import { setScholarApiKey } from './crawler/google-scholar.ts';
import { inferResourceType } from './resources.ts';

const semanticPaper = {
  title: 'Robot &amp; agent evaluation',
  abstract: 'A <i>robotics</i> benchmark.',
  authors: [{ name: 'A Researcher' }],
  url: 'https://www.semanticscholar.org/paper/example',
  externalIds: { DOI: '10.1234/EXAMPLE' },
  year: 2026,
  publicationDate: '2026-09-30',
};
const crossrefPaper = {
  DOI: '10.1234/example',
  title: [semanticPaper.title],
  abstract: semanticPaper.abstract,
  author: [{ given: 'A', family: 'Researcher' }],
  published: { 'date-parts': [[2026, 9, 30]] },
  'container-title': ['Robotics Journal'],
};

test('free academic parsers retain provenance, normalize DOI duplicates and preserve date precision', () => {
  for (const [source, paper] of [
    ['Semantic Scholar', semanticPaper],
    ['Crossref', crossrefPaper],
  ] as const) {
    const items = parseAcademicResults(source, [null, {}, paper, paper], new Date('2026-10-02'));
    assert.equal(items.length, 1);
    assert.equal(items[0].source, source);
    assert.equal(items[0].title, 'Robot & agent evaluation');
    assert.equal(items[0].author, 'A Researcher');
    assert.equal(items[0].url, 'https://doi.org/10.1234/example');
    assert.equal(items[0].publishedAt, '2026-09-30T00:00:00.000Z');
    assert.equal(items[0].provenance.mode, 'official_api');
    assert.equal(inferResourceType(items[0].url, source), 'paper');
  }
  const partial = parseAcademicResults('Crossref', [
    { ...crossrefPaper, published: { 'date-parts': [[2026]] } },
  ])[0];
  assert.equal(partial.publishedAt, null);
  assert.match(partial.summary, /2026/);
  assert.equal(
    parseAcademicResults('Semantic Scholar', [
      { ...semanticPaper, publicationDate: '2026-02-30' },
    ])[0].publishedAt,
    null,
  );
  assert.equal(
    parseAcademicResults('Semantic Scholar', [{ ...semanticPaper, publicationDate: null }])[0]
      .publishedAt,
    null,
  );
  assert.deepEqual(
    parseAcademicResults('Semantic Scholar', [
      { title: 'Unsafe', url: 'javascript:alert(1)' },
      { title: 'Credentials', url: 'https://user:password@example.org/paper' },
      { title: 'Missing URL' },
    ]),
    [],
  );
  assert.equal(
    parseAcademicResults('Crossref', [
      { title: ['URL only'], URL: 'https://example.org/paper.pdf' },
    ])[0].url,
    'https://example.org/paper.pdf',
  );
});

test('free harvest supports scoped search, cache, failures, cooldowns and batch search without SerpApi', async (t) => {
  let clock = Date.now();
  t.mock.method(Date, 'now', () => clock);
  const advance = (ms = 2000) => {
    clock += ms;
  };
  const requested: URL[] = [];
  let respond: (url: URL) => Response | Promise<Response> = (url) =>
    url.hostname === 'api.crossref.org'
      ? Response.json({ message: { items: [crossrefPaper] } })
      : Response.json({ data: [semanticPaper] });
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    requested.push(url);
    assert.equal(url.searchParams.has('api_key'), false);
    assert.equal(new Headers(init?.headers).has('x-api-key'), false);
    assert.notEqual(url.hostname, 'serpapi.com');
    return respond(url);
  });
  for (const source of ['Semantic Scholar', 'Crossref'] as const) {
    const before = requested.length;
    const pending = await harvestPublicSources(true, [], source);
    assert.equal(pending.health[0].labelEn, 'Waiting for topics');
    assert.equal(requested.length, before);
    const live = await harvestPublicSources(true, ['Robotics', 'Agents'], source);
    assert.equal(live.health[0].state, 'live');
    assert.equal(live.sections.academic[0].source, source);
    assert.deepEqual(
      live.health.map((health) => health.source),
      [source],
    );
    assert.equal(live.sections.social.length + live.sections.opensource.length, 0);
    assert.equal((await harvestPublicSources(false, ['Robotics', 'Agents'], source)).cache, 'hit');
    assert.equal(requested.length, before + 1);
  }
  assert.equal(requested[0].searchParams.get('query'), '"Robotics" | "Agents"');
  assert.equal(requested[1].searchParams.get('query.bibliographic'), 'Robotics Agents');
  assert.equal(requested[1].searchParams.get('rows'), '20');

  for (const failure of [
    () => new Response('Unavailable', { status: 503 }),
    () => new Response('not JSON'),
    () => Response.json({ error: 'Incomplete payload' }),
    () => {
      throw new Error('Private upstream diagnostic');
    },
  ]) {
    advance();
    respond = failure;
    const stale = await harvestPublicSources(true, ['Robotics', 'Agents'], 'Crossref');
    assert.equal(stale.cache, 'stale_fallback');
    assert.equal(stale.health[0].state, 'error');
    assert.equal(stale.sections.academic.length, 1);
    assert.equal(JSON.stringify(stale).includes('Private upstream diagnostic'), false);
  }
  advance();
  respond = () => Response.json({ message: { items: [] } });
  const empty = await harvestPublicSources(true, ['Robotics', 'Agents'], 'Crossref');
  assert.equal(empty.cache, 'fresh');
  assert.deepEqual(empty.sections.academic, []);
  assert.equal(empty.health[0].state, 'limited');

  advance();
  respond = () => new Response('', { status: 429, headers: { 'retry-after': '120' } });
  await assert.rejects(fetchFreeAcademic('Crossref', ['Limits']), /rate limit/);
  const count = requested.length;
  advance(61_000);
  await assert.rejects(fetchFreeAcademic('Crossref', ['Limits']), /retry in/);
  assert.equal(requested.length, count, 'cooldown prevents further provider requests');
  advance(61_000);

  let release!: (response: Response) => void;
  respond = () =>
    new Promise<Response>((resolve) => {
      release = resolve;
    });
  const first = fetchFreeAcademic('Crossref', ['Concurrency']);
  await assert.rejects(fetchFreeAcademic('Crossref', ['Other topic']), /already running/);
  release(Response.json({ message: { items: [crossrefPaper] } }));
  assert.equal((await first).length, 1);

  advance();
  respond = (url) => {
    if (url.hostname === 'api.crossref.org')
      return Response.json({ message: { items: [crossrefPaper] } });
    if (url.hostname === 'api.semanticscholar.org') return Response.json({ data: [semanticPaper] });
    throw new Error('Unrelated source unavailable in test');
  };
  setScholarApiKey('configured-paid-provider-test-key');
  try {
    const batch = await harvestPublicSources(true, ['Robotics', 'Agents']);
    assert.equal(
      batch.sections.academic.length,
      1,
      'the same DOI is deduplicated across free sources',
    );
    assert.equal(batch.health.find((health) => health.source === 'Crossref')?.state, 'live');
    assert.equal(
      batch.health.find((health) => health.source === 'Semantic Scholar')?.state,
      'live',
    );
    assert.equal(
      batch.health.some((health) => health.source === 'Google Scholar'),
      false,
    );
    assert.equal(
      requested.some((url) => url.hostname === 'serpapi.com'),
      false,
    );
  } finally {
    setScholarApiKey(null);
  }
});
