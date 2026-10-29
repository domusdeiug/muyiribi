import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreRelevance, normalizeAdvert, searchJiji, searchMarketplace } from '../src/marketplace.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures_jiji_search.json', import.meta.url)));
function advert(guid, title, price = 100) {
  return { guid, title, price_obj: { value: price, view: `USh ${price}` }, attrs: [] };
}
function pages(data, seen = []) {
  return async (url, options) => {
    const params = new URL(url).searchParams;
    seen.push(params);
    assert.equal(options.headers.cookie, 'rid=jiji.ug; lang=en');
    return new Response(JSON.stringify({ adverts_list: { adverts: data[params.get('page')] ?? [] } }), { status: 200 });
  };
}

test('complete phrases, plurals and exact model numbers', () => {
  const syn = ['wedding dress', 'bridal gown', 'bridal dress'];
  for (const title of ['Oxford Dress Shoes', 'PS5 Controller - Wedding Shirt', 'Bridal Wedding Tiara', 'Party Dress for Wedding', 'Wedding Gownlet']) {
    assert.equal(scoreRelevance(title, 'wedding gown', syn), 0, title);
  }
  for (const title of ['Wedding Gowns', 'Two in One Bridal Dress', 'Wedding Dress for Hire']) {
    assert.ok(scoreRelevance(title, 'wedding gown', syn) > 0, title);
  }
  assert.equal(scoreRelevance('Apple iPhone 11', 'iphone 13', ['apple iphone 13']), 0);
  assert.ok(scoreRelevance('Apple iPhone 13 Pro', 'iphone 13', []) > 0);
  assert.ok(scoreRelevance('Laptop Lenovo ThinkPad', 'lenovo laptop', []) > 0);
});

test('normalize captured Jiji advert, including image and stable link', () => {
  const listing = normalizeAdvert(fixture.adverts_list.adverts[0]);
  assert.equal(listing.id, 'jiji:l6h0pqJE7CnOrI7hxXDJ34DJ');
  assert.equal(listing.price, 'USh 400,000');
  assert.equal(listing.condition, 'Used');
  assert.equal(listing.attrs.Processor, 'Intel Core i5');
  assert.equal(listing.image_count, 2);
  assert.ok(listing.image.startsWith('https://pictures-uganda.jijistatic.com/'));
  assert.ok(!listing.listing_url.includes('?'));
  assert.equal(normalizeAdvert(fixture.adverts_list.adverts[2]), null);
});

test('ranking, budget before quota, lookahead, deduplication and cap', async () => {
  const seen = [];
  const request = pages({
    1: [advert('one', 'Bridal Dress Available'), advert('two', 'Bridal Gown Available'), advert('expensive', 'Wedding Gown Available', 1000)],
    2: [advert('three', 'Wedding Gown Available'), advert('one', 'Bridal Dress Available')],
    3: [advert('four', 'Wedding Gown Available')],
  }, seen);
  const results = await searchJiji({ query: 'wedding gown', synonyms: ['bridal dress', 'bridal gown'], target_results: 2, max_price: 200 }, request);
  assert.deepEqual(results.map(r => r.id), ['jiji:three', 'jiji:one']);
  assert.deepEqual(seen.map(p => p.get('page')), ['1', '2']);
  assert.ok(seen.every(p => p.get('sort') === 'new'));
  assert.ok(results.every(r => !('price_amount' in r)));
});

test('explicit price sort stays one unscored page', async () => {
  const seen = [];
  const result = await searchJiji({ query: 'wedding gown', sort: 'price' }, pages({ 1: [advert('shoes', 'Oxford Dress Shoes')] }, seen));
  assert.equal(result[0].title, 'Oxford Dress Shoes');
  assert.deepEqual(seen.map(p => p.get('sort')), ['price']);
});

test('upstream HTTP failures log safe request position and diagnostic headers', async () => {
  const original = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  const query = 'private shopping query';
  try {
    const blocked = async () => new Response('blocked', {
      status: 403, headers: { 'cf-ray': 'test-ray', 'cf-mitigated': 'challenge', 'content-type': 'text/html' },
    });
    await assert.rejects(searchJiji({ query }, blocked), /HTTP 403/);
    assert.deepEqual(logs[0][1], {
      phase: 'search', page: 1, sort: 'new', status: 403,
      cfRay: 'test-ray', cfMitigated: 'challenge', retryAfter: null,
      server: null, contentType: 'text/html',
    });
    assert.ok(!JSON.stringify(logs).includes(query), 'shopping query must not be logged');

    logs.length = 0;
    let count = 0;
    await assert.rejects(searchJiji({ query }, async () => {
      if (++count === 1) return Response.json({ status: 'redirect', url: '/computers-and-laptops' });
      return new Response('blocked', { status: 403, headers: { 'retry-after': '60' } });
    }), /HTTP 403/);
    assert.equal(logs[0][1].phase, 'category-redirect');
    assert.equal(logs[0][1].retryAfter, '60');
    assert.ok(!JSON.stringify(logs).includes(query));
  } finally {
    console.error = original;
  }
});

test('cache hit, unknown source, and upstream errors', async () => {
  const store = new Map();
  const cache = {
    match: async key => store.get(key.url),
    put: async (key, value) => { store.set(key.url, value); },
  };
  let calls = 0;
  const request = async () => { calls++; return new Response(JSON.stringify(fixture)); };
  const params = { query: 'lenovo laptop', target_results: 2, max_fetch_pages: 1 };
  const first = await searchMarketplace(params, request, cache);
  assert.equal(first.cached, false);
  assert.equal(first.count, 2);
  assert.equal(calls, 1);
  const second = await searchMarketplace(params, request, cache);
  assert.equal(second.cached, true);
  assert.equal(second.count, 2);
  assert.equal(calls, 1);
  const other = await searchMarketplace({ query: 'anything', source: 'olx' }, request, cache);
  assert.ok(other.error);
  const failed = await searchMarketplace({ query: 'wedding gown' }, async () => new Response('', { status: 403 }));
  assert.ok(failed.error);
  assert.deepEqual(failed.listings, []);
});
