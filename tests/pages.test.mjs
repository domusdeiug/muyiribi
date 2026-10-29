import { test } from 'node:test';
import assert from 'node:assert/strict';
import { landingPage, infoPage, privacyPage, termsPage, searchPage, pricingPage } from '../src/pages.ts';

test('website keeps business-directory search distinct from AI product search', () => {
  const home = landingPage(null);
  assert.match(home, /UgOnline · Muyiribi/);
  assert.match(home, /action="\/search"/);
  assert.match(home, /Search businesses/);
  assert.match(home, /This website's search is for businesses, not individual products/);
  const directory = searchPage(null, [], [], { keyword: '', district: '', category: '' });
  assert.match(directory, /Find a business/);
  assert.doesNotMatch(directory, /search_marketplace/);
  const about = infoPage();
  assert.match(about, /searches available marketplace listings and helps you compare options/i);
  assert.match(about, /business listing here does not publish products/i);
});

test('policy and pricing copy distinguishes external adverts from paid directory tiers', () => {
  assert.match(termsPage(), /Comparisons are unsponsored/);
  assert.match(privacyPage(), /send your search terms and applicable filters to external marketplaces/);
  assert.match(pricingPage(null, []), /They do not affect product recommendations/);
});
