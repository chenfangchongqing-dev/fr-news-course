const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const n = require('../04-corpus/news-search.js');
const candidates = JSON.parse(fs.readFileSync('data/rss/xinhua_fr_zh_candidates.json'));
const reviews = JSON.parse(fs.readFileSync('data/reviewed/xinhua_fr_zh_reviews.json'));
const rows = n.prepareRows(candidates, reviews);
const base = {keyword:'', category:'all', status:'all', from:'', to:'', sort:'desc'};
test('original 160 sources retained; three separately verified, 157 pending', () => {
  assert.equal(rows.length, 160);
  assert.equal(n.filterRows(rows, {...base, status:'verified'}).length, 3);
  assert.equal(n.filterRows(rows, {...base, status:'pending'}).length, 157);
});
test('recent range excludes 2022, includes both boundaries, uses publication date', () => {
  assert.equal(n.filterRows(rows, {...base, ...n.dateRange(30,'2026-10-11')}).length, 20);
  assert.equal(n.filterRows(rows, {...base, from:'2022-04-15',to:'2022-04-15'}).every(r=>r.published_fr==='2022-04-15'),true);
  assert.deepEqual(n.dateRange(7,'2026-01-01'),{from:'2025-12-26',to:'2026-01-01'});
  assert.equal(n.validDate('2026-02-30'),'');
});
test('combined keyword/category/status/date filters and accent-insensitive matching', () => {
  assert.equal(n.filterRows(rows, {...base, keyword:'zhongxing', category:'Chine',status:'verified',from:'2022-04-15',to:'2022-04-15'}).length,1);
  assert.equal(n.filterRows(rows, {...base, keyword:'中星6D'}).length,1);
  assert.equal(n.filterRows(rows, {...base, keyword:'economie reformes',category:'Europe'}).length,1);
  assert.equal(n.filterRows(rows, {...base, keyword:'no_such_title_9384'}).length,0);
});
test('raw candidate confirmation fields never promote a record; incomplete reviews fail closed', () => {
  const r={...candidates[0],zh_match_status:'verified',confirmed_url_zh:'https://www.news.cn/x',confirmed_title_zh:'fake'};
  assert.equal(n.prepareRows([r],[])[0].review,null);
  assert.equal(n.isVerified({...reviews[0],verification_notes:[]}),false);
  assert.equal(n.isVerified({...reviews[0],confirmed_url_zh:'javascript:alert(1)'}),false);
  assert.equal(n.prepareRows([{...reviews[0],published_fr:'2020-01-01'}],reviews.slice(0,1))[0].review,null);
});
test('reviewed sources survive candidate rotation and HTTP/HTTPS duplicates collapse', () => {
  assert.equal(n.prepareRows([], reviews).length,3);
  assert.equal(n.prepareRows([candidates[20], {...candidates[20],url_fr:candidates[20].url_fr.replace('http:','https:')}],[]).length,1);
  assert.equal(n.safeURL('javascript:alert(1)'),'');
});
