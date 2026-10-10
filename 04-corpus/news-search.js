/* Candidate feeds never confer verification. Only complete, separately reviewed records do. */
(function () {
  'use strict';
  const DAY = 86400000;
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
  }
  function safeURL(value) {
    try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; }
    catch (_) { return ''; }
  }
  function urlKey(value) { return safeURL(value).replace(/^http:/, 'https:'); }
  function isVerified(review) {
    return Boolean(review && review.status === 'verified' && review.title_fr && safeURL(review.url_fr) &&
      review.confirmed_title_zh && safeURL(review.confirmed_url_zh) && validDate(review.published_fr) &&
      validDate(review.published_zh) && validDate(review.verified_at) && review.source_zh &&
      review.published_at_fr_display && review.published_at_zh_display && review.verification_method &&
      Array.isArray(review.verification_notes) && review.verification_notes.some(note => String(note).trim()));
  }
  function prepareRows(candidates, reviews) {
    const byURL = new Map();
    for (const row of candidates) {
      if (row && row.title_fr && safeURL(row.url_fr)) byURL.set(urlKey(row.url_fr), {...row, review: null});
    }
    for (const review of reviews) {
      if (!isVerified(review)) continue;
      const key = urlKey(review.url_fr);
      // Keep reviewed sources searchable even after a future feed rotation.
      const row = byURL.get(key) || review;
      if (row.title_fr !== review.title_fr || row.published_fr !== review.published_fr) continue;
      byURL.set(key, {...row, review});
    }
    return [...byURL.values()];
  }
  function filterRows(rows, f) {
    const words = normalize(f.keyword).trim().split(/\s+/).filter(Boolean);
    return rows.filter(row => {
      const date = validDate(row.published_fr);
      const status = row.review ? 'verified' : 'pending';
      const haystack = normalize([row.title_fr, row.zh_keywords, row.category, row.theme, row.source,
        row.review?.confirmed_title_zh].join(' '));
      return (f.category === 'all' || row.category === f.category) &&
        (f.status === 'all' || status === f.status) && words.every(w => haystack.includes(w)) &&
        (!(f.from || f.to) || (date && (!f.from || date >= f.from) && (!f.to || date <= f.to)));
    }).sort((a, b) => {
      const da = validDate(a.published_fr), db = validDate(b.published_fr);
      if (!da) return db ? 1 : 0;
      if (!db) return -1;
      return (f.sort === 'asc' ? da.localeCompare(db) : db.localeCompare(da)) || a.title_fr.localeCompare(b.title_fr, 'fr');
    });
  }
  function dateRange(days, today) {
    return {from: new Date(Date.parse(today + 'T00:00:00Z') - (days - 1) * DAY).toISOString().slice(0, 10), to: today};
  }
  const api = {normalize, validDate, safeURL, urlKey, isVerified, prepareRows, filterRows, dateRange};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  const cutoff = dateRange(30, today).from;
  const categories = {Chine: '中国 · Chine', Monde: '世界 · Monde', Europe: '欧洲 · Europe', Afrique: '非洲 · Afrique', Culture: '文化 · Culture', Science: '科技 · Science', Economie: '经济 · Économie', 'Environnement/Tourisme': '环境与旅游'};
  let rows = [], page = 1, loaded = false;
  const pageSize = 12;
  const el = (tag, text, cls) => { const node = document.createElement(tag); if (text) node.textContent = text; if (cls) node.className = cls; return node; };
  function link(label, url) {
    const node = el('a', label); const safe = safeURL(url);
    if (safe) { node.href = safe; node.target = '_blank'; node.rel = 'noopener noreferrer'; }
    return node;
  }
  function defaultQuery(row) {
    if (row.review) return row.review.confirmed_title_zh + ' ' + row.published_fr;
    // Old generated keyword lists sometimes contain incidental French words and false UE hits.
    const terms = (row.zh_keywords || '').match(/[\u3400-\u9fff]+/g) || [];
    return [...new Set(['新华社', ...terms])].join(' ') + ' ' + (validDate(row.published_fr) || '');
  }
  function renderCard(row, index) {
    const card = el('section', '', 'result news-card');
    card.dataset.status = row.review ? 'verified' : 'pending';
    card.dataset.date = row.published_fr || '';
    const badge = el('span', row.review ? '已核验 · 对应报道' : '待核验 · 法语来源', 'badge ' + (row.review ? 'status-verified' : 'status-pending'));
    card.append(badge, el('span', categories[row.category] || row.category, 'badge'));
    const date = validDate(row.published_fr);
    if (date && date < cutoff) card.append(el('span', '历史报道 · ' + date.slice(0, 4), 'badge status-archive'));
    if (date && date > today) card.append(el('span', '日期异常 · 待核查', 'badge status-pending'));
    const title = el('h2', row.title_fr); title.lang = 'fr'; card.append(title);
    card.append(el('p', `法文发表：${date || '日期缺失，待核查'} · 来源：${row.source || 'Xinhua French'}`, 'meta'));
    const actions = el('div', '', 'news-actions'); actions.append(link('阅读法语原文 ↗', row.url_fr)); card.append(actions);
    if (row.review) {
      const r = row.review, summary = el('div', '', 'review-summary');
      const p = el('p'); p.append(el('strong', '中文对应报道：'), link(r.confirmed_title_zh + ' ↗', r.confirmed_url_zh));
      summary.append(p, el('p', `中文发表：${r.published_at_zh_display} · 来源：${r.source_zh}`, 'meta'));
      card.append(summary);
      const evidence = el('details'); evidence.append(el('summary', '查看核验依据与时间'));
      evidence.append(el('p', `核验日期：${r.verified_at}。法文页面时间：${r.published_at_fr_display}；中文页面时间：${r.published_at_zh_display}。`, 'meta'));
      evidence.append(el('p', r.verification_method, 'meta'));
      const notes = el('ul', '', 'review-notes'); r.verification_notes.forEach(note => notes.append(el('li', note))); evidence.append(notes); card.append(evidence);
    } else {
      card.append(el('p', '中文对应报道尚未确认。请先核对事件、人物、日期与主要事实，再用于汉法对照。', 'meta'));
    }
    const search = el('details'); search.append(el('summary', '查找中文对应报道'));
    const box = el('div', '', 'zh-search');
    const input = el('input'); input.type = 'search'; input.id = 'zh-query-' + index; input.value = defaultQuery(row);
    const label = el('label', '中文检索词（可修改）'); label.htmlFor = input.id;
    const links = el('div', '', 'news-actions');
    const baidu = link('百度检索 ↗', 'https://www.baidu.com/');
    const google = link('Google 检索新华网 ↗', 'https://www.google.com/');
    const update = () => {
      const q = input.value.trim() || defaultQuery(row);
      baidu.href = 'https://www.baidu.com/s?wd=' + encodeURIComponent(q);
      google.href = 'https://www.google.com/search?q=' + encodeURIComponent('(site:news.cn OR site:xinhuanet.com) ' + q);
    };
    update(); input.addEventListener('input', update); links.append(baidu, google);
    box.append(label, input, links, el('p', '检索词仅作线索，不是中文译文；搜索结果须逐篇核对。可补入人名、地点、数字以缩小范围。', 'meta'));
    search.append(box); card.append(search);
    return card;
  }
  function syncDates() {
    const period = $('newsPeriod').value;
    if (period === 'all') { $('dateFrom').value = ''; $('dateTo').value = ''; }
    else if (period !== 'custom') { const range = dateRange(Number(period), today); $('dateFrom').value = range.from; $('dateTo').value = range.to; }
  }
  function saveFilters(f) {
    const params = new URLSearchParams();
    const values = {q: f.keyword, category: f.category, status: f.status, period: $('newsPeriod').value, sort: f.sort};
    if (values.period === 'custom') { values.from = f.from; values.to = f.to; }
    for (const [k, v] of Object.entries(values)) if (v) params.set(k, v);
    history.replaceState(null, '', location.pathname + '?' + params.toString());
  }
  function render(scroll = false) {
    if (!loaded) return;
    const f = {keyword: $('newsKeyword').value.trim(), category: $('newsCategory').value, status: $('newsStatus').value, from: $('dateFrom').value, to: $('dateTo').value, sort: $('newsSort').value};
    const invalid = f.from && f.to && f.from > f.to;
    $('filterError').hidden = !invalid;
    $('filterError').textContent = invalid ? '开始日期不能晚于结束日期，请调整后重新检索。' : '';
    $('newsResults').replaceChildren();
    if (invalid) { $('resultCount').textContent = ''; $('pageInfo').textContent = ''; $('prevPage').disabled = true; $('nextPage').disabled = true; return; }
    const result = filterRows(rows, f), pages = Math.max(1, Math.ceil(result.length / pageSize));
    page = Math.max(1, Math.min(page, pages));
    $('dateHelp').textContent = `按法文发表日期筛选，北京时间今天为 ${today}。${f.from || f.to ? '当前范围：' + (f.from || '不限') + ' 至 ' + (f.to || '不限') + '。日期缺失的记录不纳入此范围。' : '当前包含历史报道和日期缺失的记录。'}`;
    const verified = result.filter(row => row.review).length;
    $('resultCount').textContent = `找到 ${result.length} 条 · 已核验 ${verified} · 待核验 ${result.length - verified}`;
    if (!result.length) $('newsResults').append(el('p', '没有符合条件的报道。可清除关键词、切换栏目，或选择“全部日期（含历史报道）”。'));
    result.slice((page - 1) * pageSize, page * pageSize).forEach((row, i) => $('newsResults').append(renderCard(row, i)));
    $('pageInfo').textContent = `第 ${page} / ${pages} 页`;
    $('prevPage').disabled = page === 1; $('nextPage').disabled = page === pages;
    saveFilters(f);
    if (scroll) $('resultCount').scrollIntoView({behavior: 'smooth', block: 'start'});
  }
  function changed() { page = 1; render(); }
  $('newsFilters').addEventListener('submit', event => { event.preventDefault(); changed(); });
  ['newsCategory', 'newsStatus', 'newsSort'].forEach(id => $(id).addEventListener('change', changed));
  $('newsKeyword').addEventListener('input', changed);
  $('newsPeriod').addEventListener('change', () => { syncDates(); changed(); });
  ['dateFrom', 'dateTo'].forEach(id => $(id).addEventListener('change', () => { $('newsPeriod').value = 'custom'; changed(); }));
  $('resetFilters').addEventListener('click', () => { $('newsFilters').reset(); $('newsSort').value = 'desc'; syncDates(); changed(); });
  $('prevPage').addEventListener('click', () => { page--; render(true); });
  $('nextPage').addEventListener('click', () => { page++; render(true); });
  async function getJSON(path) {
    const response = await fetch(path, {cache: 'no-cache'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('资料格式不正确');
    return data;
  }
  async function init() {
    const results = await Promise.allSettled([getJSON('../data/rss/xinhua_fr_zh_candidates.json'), getJSON('../data/reviewed/xinhua_fr_zh_reviews.json')]);
    const candidates = results[0].status === 'fulfilled' ? results[0].value : [];
    const reviews = results[1].status === 'fulfilled' ? results[1].value : [];
    rows = prepareRows(candidates, reviews);
    if (results.some(r => r.status === 'rejected')) {
      $('loadError').hidden = false;
      $('loadError').append(el('p', results[0].status === 'rejected' ? '候选资料加载失败；目前仅能显示已成功加载的核验记录。' : '核验记录加载失败，所有候选材料暂按待核验显示。'));
      const retry = el('button', '重新加载'); retry.type = 'button'; retry.addEventListener('click', () => location.reload()); $('loadError').append(retry);
    }
    for (const category of [...new Set(rows.map(r => r.category).filter(Boolean))].sort()) {
      const option = el('option', categories[category] || category); option.value = category; $('newsCategory').append(option);
    }
    const params = new URLSearchParams(location.search);
    $('newsKeyword').value = params.get('q') || '';
    for (const [id, key] of [['newsCategory', 'category'], ['newsStatus', 'status'], ['newsPeriod', 'period'], ['newsSort', 'sort']]) {
      if ([...$(id).options].some(o => o.value === params.get(key))) $(id).value = params.get(key);
    }
    syncDates();
    if ($('newsPeriod').value === 'custom') { $('dateFrom').value = validDate(params.get('from')); $('dateTo').value = validDate(params.get('to')); }
    const dates = rows.map(r => validDate(r.published_fr)).filter(Boolean).sort();
    const collected = candidates.map(r => r.collected_at || '').sort().at(-1)?.slice(0, 10) || '未知';
    const verified = rows.filter(r => r.review).length;
    const old = rows.filter(r => validDate(r.published_fr) && r.published_fr < cutoff).length;
    $('datasetInfo').textContent = `资料共 ${rows.length} 条 · 已核验 ${verified} 条 · 候选采集日期 ${collected} · 最新法文发表日期 ${dates.at(-1) || '未知'}。其中 ${old} 条早于近30天范围；采集时间不等于发表时间。`;
    loaded = true; $('newsResults').setAttribute('aria-busy', 'false'); render();
  }
  init().catch(() => { $('loadError').hidden = false; $('loadError').textContent = '资料暂时无法显示，请刷新页面重试。'; $('newsResults').setAttribute('aria-busy', 'false'); });
})();
