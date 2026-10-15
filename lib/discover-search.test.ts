import assert from 'node:assert/strict';
import test from 'node:test';
import { combineSearchPayloads, parseSearchTerms, searchMatchGroup } from './discover-search.ts';
import type { HarvestItem, HarvestPayload } from './crawler/types.ts';

test('a plus sign separates two distinct topics without splitting ordinary searches', () => {
  assert.deepEqual(parseSearchTerms(' DeepSeek + AI '), ['DeepSeek', 'AI']);
  assert.deepEqual(parseSearchTerms('DeepSeek'), ['DeepSeek']);
  assert.deepEqual(parseSearchTerms('C++'), ['C++']);
  assert.deepEqual(parseSearchTerms('AI + ai'), ['AI + ai']);
});

test('literal title and description matches put both topics before either topic alone', () => {
  const terms = ['DeepSeek', 'AI'];
  assert.equal(searchMatchGroup({ title: 'DeepSeek and AI', summary: '' }, terms), 0);
  assert.equal(searchMatchGroup({ title: 'DeepSeek models', summary: '' }, terms), 1);
  assert.equal(searchMatchGroup({ title: 'AI systems', summary: '' }, terms), 2);
  assert.equal(searchMatchGroup({ title: 'Training tips', summary: '' }, terms), null);
  assert.equal(searchMatchGroup({ title: 'DeepSeek training', summary: '' }, terms), 1);
});

test('results from separate source searches are deduplicated by URL', () => {
  const item = {
    id: 'video-1',
    source: 'YouTube',
    url: 'https://www.youtube.com/watch?v=video-1',
  } as HarvestItem;
  const payload = {
    generatedAt: '2026-10-14T00:00:00Z',
    cache: 'fresh',
    sections: { social: [item], academic: [], opensource: [] },
    health: [
      {
        source: 'YouTube',
        section: 'social',
        state: 'live',
        label: 'Live',
        labelEn: 'Live',
        detail: '',
        detailEn: '',
        itemCount: 1,
      },
    ],
    warnings: [],
  } as HarvestPayload;
  const combined = combineSearchPayloads([payload, payload]);
  assert.equal(combined.sections.social.length, 1);
  assert.equal(combined.health[0].itemCount, 1);
});
