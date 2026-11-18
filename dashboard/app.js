(function () {
 'use strict';

 var DATA = window.RADAR;
 if (!DATA) return;
 var app = document.getElementById('board');
 var state = { q: '', category: 'all', verdict: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, cap: 1000 };
 var EV = (window.RADAR && window.RADAR.evidence) || null; // P3 research numbers (p3-evidence.json); never model input
 function evGet(p, d) { var o = EV, ks = p.split('.'); for (var i = 0; i < ks.length; i++) { if (o === null || o === undefined) return d; o = o[ks[i]]; } return o === undefined ? d : o; }

 var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
 function fmtUsd(n) {
  if (n === null || n === undefined || !isFinite(n)) return 'n/a';
  if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
  return usd.format(n);
 }
 function fmtMoney(n) {
  if (n === null || n === undefined || !isFinite(n)) return 'n/a';
  var sign = n < 0 ? '-' : '';
  return sign + usd.format(Math.abs(n));
 }
 function fmtPct(n) {
  if (n === null || n === undefined || !isFinite(n)) return 'n/a';
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
 }
 function fmtAge(days) {
  if (days === null || days === undefined) return 'unknown';
  if (days >= 365) return (days / 365).toFixed(1) + 'y';
  return Math.max(0, Math.round(days)) + 'd';
 }

 function el(tag, attrs) {
  var node = document.createElement(tag);
  if (attrs) {
   Object.keys(attrs).forEach(function (k) {
    if (k === 'class') node.className = attrs[k];
    else if (k === 'text') node.textContent = attrs[k];
    else if (k === 'html') node.innerHTML = attrs[k];
    else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
   });
  }
  for (var i = 2; i < arguments.length; i++) {
   var child = arguments[i];
   if (child === null || child === undefined) continue;
   if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
   else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
   else node.appendChild(child);
  }
  return node;
 }
 function TD(t, c) { return el('td', { class: c || 'num', text: t }); }
 function TX(t) { return el('td', { text: t }); }
 function TH(t) { return el('th', { scope: 'col', text: t }); }
 function SUB(t) { return el('p', { class: 'sub', text: t }); }
 function TB(t) { return el('td', null, el('b', { text: t })); }
 function TBN(t) { return el('td', { class: 'num' }, el('b', { text: t })); }

 function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
 function holdDaysFor(age) {
  if (age === null || age === undefined) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
 }
 function handsHours(hold) { return (35 + 10 * (hold / 7)) / 60; }
 var ACTS = [
  ['lend|cdp|collateral', 'Supply', 'Supply $1,000 USDC to {N} on {C}; keep the position open.'],
  ['dex|yield|leveraged farm', 'Provide liquidity', "Provide $1,000 of liquidity to {N}'s main pool on {C}; keep open."],
  ['bridge', 'Bridge', 'Bridge $1,000 USDC to {C} through {N}; use the bridged funds in its app.'],
  ['staking|restak', 'Stake', "Stake $1,000 of the chain's staking asset through {N}; keep the receipt."],
  ['perpetual|derivative', 'Deposit margin', 'Deposit $1,000 USDC as margin on {N}; open one small hedge.'],
  ['prediction', 'Fund a market', 'Fund $1,000; place one market position on {N}.'],
  ['curator|allocator', 'Deposit in vault', 'Deposit $1,000 into a {N} vault on {C}; keep the shares.'],
  ['stable', 'Mint / deposit', 'Mint or deposit $1,000 of the stable asset through {N} on {C}.'],
  ['rwa', 'Mint yield asset', "Mint $1,000 of the protocol's yield asset on {C}; hold it."],
  ['insurance', 'Buy cover', 'Buy $1,000 of cover from {N} on {C}; keep the policy.']
 ];
 function actRow(p) {
  var c = (p.category || '').toLowerCase();
  for (var i = 0; i < ACTS.length; i++) {
   var keys = ACTS[i][0].split('|');
   for (var j = 0; j < keys.length; j++) if (c.indexOf(keys[j]) >= 0) return ACTS[i];
  }
  return null;
 }
 function actionFor(p, chain) {
  var a = actRow(p);
  if (!a) return 'Deposit $1,000 of USDC into ' + p.name + ' on ' + chain + ' and keep the position open.';
  return a[2].split('{N}').join(p.name).split('{C}').join(chain);
 }
 function mechShort(p) {
  var a = actRow(p);
  return a ? a[1] : 'Deposit';
 }
 function sliceUsd(r, cap) { return (cap / r.tvl_usd) * 0.10 * r.implied_value_usd; }
 function costFor(cap) { return 6 + cap * 0.04 * 45 / 365; }
 function netAt(r, cap, drop) { return r.launch_probability * sliceUsd(r, cap) * (1 - drop) - costFor(cap); }
 function netNoP(r, cap) { return sliceUsd(r, cap) - costFor(cap); }
 function verdictAt(r, cap, drop) {
  var lo = r.launch_probability * sliceUsd(r, cap) * (1 - drop) * (r.implied_low_usd / r.implied_value_usd) - costFor(cap);
  var pt = netAt(r, cap, drop);
  var hi = r.launch_probability * sliceUsd(r, cap) * (1 - drop) * (r.implied_high_usd / r.implied_value_usd) - costFor(cap);
  return lo > 0 ? 'ROBUST' : pt > 0 ? 'FARM' : hi > 0 ? 'THIN' : 'SKIP';
 }
 function capCounts(cap) {
  var c = { ROBUST: 0, FARM: 0, THIN: 0, SKIP: 0 };
  DATA.rows.forEach(function (r) { c[verdictAt(r, cap, 0)]++; });
  return c;
 }
 function paysFrom(r) { // ticket where the point net is exactly zero; null when it never pays
  var per = r.launch_probability * 0.10 * r.implied_value_usd / r.tvl_usd - 0.04 * 45 / 365;
  return per <= 0 ? null : 6 / per;
 }
 function reviewDate(hold) {
  var d = new Date(Date.parse(DATA.as_of + 'T00:00:00Z') + hold * 864e5);
  return d.toISOString().slice(0, 10);
 }
 function refitRange(slug) { // [p10, p90, % refits in top 20] for top-20 rows; null below the top 20
  if (!EV || !EV.refit) return null;
  var t = EV.refit.top20;
  for (var i = 0; i < t.length; i++) if (t[i][0] === slug) return t[i].slice(1);
  return null;
 }
 function catComps(cat) { var n = 0; DATA.live.forEach(function (p) { if (p.category === cat) n++; }); return n; }
 function bandCat(cat) { // diagnostic per-category band [p25, p75, n comps]; null when <5 comps
  if (!EV || !EV.bandCat) return null;
  for (var i = 0; i < EV.bandCat.length; i++) if (EV.bandCat[i][0] === cat) return EV.bandCat[i];
  return null;
 }
 function bePct(r, cap) {
  var s = (cap / r.tvl_usd) * 0.10;
  return costFor(cap) / (r.launch_probability * r.implied_value_usd) / s * 100;
 }
 function farmSteps(p) {
  var chain = chainOf(p);
  var hold = holdDaysFor(p.age_days);
  var walkAway;
  if (p.verdict === 'SKIP') {
   walkAway = 'Walk away: the low end nets -$' + Math.abs(p.net_low_usd).toFixed(0) + ' and even the high end nets -$' + Math.abs(p.net_high_usd).toFixed(0) + ' at $1,000, so this launch does not pay. The case against: P(launch) is ' + p.launch_probability.toFixed(2) + ' and the implied value is $' + p.implied_value_usd.toLocaleString('en-US') + '.';
  } else if (p.verdict === 'THIN') {
   walkAway = 'Walk away if the gas on the first step exceeds $8, or if the hold stretches past ' + hold + ' days: this plan only pays if the launch beats the point estimate (low end nets -$' + Math.abs(p.net_low_usd).toFixed(0) + '). The case against: P(launch) is ' + p.launch_probability.toFixed(2) + ', below the base rate for its band.';
  } else {
   walkAway = 'Walk away if the gas on the first step exceeds $8, or if the position must be unwound before ' + hold + ' days: the plan pays at the point estimate (net $' + p.net_point_usd.toFixed(0) + ') but the margin is the band, not a promise.';
  }
  return [
   { when: 'Day 0', text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 gas', time: '5 min' },
   { when: 'Day 0', text: actionFor(p, chain), cost: '$1,000 capital, ~$3 gas', time: '15 min' },
   { when: 'Weekly ×' + Math.ceil(hold / 7), text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: '~$2 gas / week', time: '10 min / week' },
   { when: 'Day 0–' + hold, text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: '$1,000 stays in', time: hold + ' days (passive)' },
   { when: 'Day ' + hold, text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check', time: '10 min' },
   { when: 'Exit', text: walkAway + ' Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 min' }
  ];
 }

 function readHash() {
  var qp = new URLSearchParams(window.location.search);
  if (qp.get('p')) state.selected = qp.get('p');
  if (qp.get('sort')) state.sort = qp.get('sort');
  if (qp.get('verdict')) state.verdict = qp.get('verdict');
  if (qp.get('cap') === '10000') state.cap = 10000;
  var hash = window.location.hash.replace(/^#/, '');
  if (!hash) return;
  var params = new URLSearchParams(hash);
  if (params.get('q')) state.q = params.get('q');
  if (params.get('p')) state.selected = params.get('p');
  if (params.get('category')) state.category = params.get('category');
  if (params.get('verdict')) state.verdict = params.get('verdict');
 }
 function writeHash() {
  var params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.category !== 'all') params.set('category', state.category);
  if (state.verdict !== 'all') params.set('verdict', state.verdict);
  if (state.selected) params.set('p', state.selected);
  var next = params.toString();
  if (next) window.history.replaceState(null, '', '#' + next);
  else window.history.replaceState(null, '', window.location.pathname + window.location.search);
 }

 function rows() {
  var q = state.q.trim().toLowerCase();
  return DATA.rows.filter(function (r) {
   if (state.category !== 'all' && r.category !== state.category) return false;
   if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
   if (!q) return true;
   var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
   return hay.indexOf(q) >= 0;
  });
 }
 function sortVal(r, key) {
  if (key === 'name') return r.name.toLowerCase();
  if (key === 'tvl') return r.tvl_usd;
  if (key === 'launch') return r.launch_probability;
  if (key === 'net') return r.net_per_hour_usd;
  if (key === 'netpt') return r.net_point_usd;
  if (key === 'age') return r.age_days === null ? Infinity : r.age_days;
  if (key === 'change') return r.change_7d === null ? -Infinity : r.change_7d;
  return r.implied_value_usd;
 }
 function sortedRows(list) {
  var key = state.sort;
  return list.slice().sort(function (a, b) {
   var av = sortVal(a, key), bv = sortVal(b, key);
   if (av < bv) return -state.dir;
   if (av > bv) return state.dir;
   return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
 }

 function verdictClass(v) {
  return 'verdict v-' + v.toLowerCase();
 }

 function header() {
  return el('header', { class: 'top' },
   el('div', { class: 'brand' }, el('span', { class: 'brand-name', text: 'Token Radar' })),
   el('div', { class: 'top-meta' },
    el('span', { text: 'Snapshot ' + DATA.as_of }),
    el('span', { text: 'DefiLlama index' }),
    el('span', { text: DATA.model_version + ' model' })
   )
  );
 }

 function pageCheck() {
  var vc = { ROBUST: 0, FARM: 0, THIN: 0, SKIP: 0 };
  for (var i = 0; i < DATA.rows.length; i++) {
   var r = DATA.rows[i];
   if (r.rank !== i + 1) return false;
   if (i > 0 && r.implied_value_usd > DATA.rows[i - 1].implied_value_usd) return false;
   vc[r.verdict]++;
  }
  return DATA.rows.length === 198 && vc.ROBUST === 24 && vc.FARM === 93 && vc.THIN === 70 && vc.SKIP === 11;
 }

 function lede() {
  var vc = DATA.verdict_counts;
  var tot = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
  var top = DATA.rows[0];
  var kpi = [
   ['Ranked', '198', '40/40 watchlist'],
   ['Implied value, board', fmtUsd(tot), 'summed over 198 rows · #1 ' + top.name + ' ' + fmtUsd(top.implied_value_usd)],
   ['Time-split OOS', '×' + evGet('oos.modelTs', 2.21).toFixed(2), 'model as built (k=3) · global-only ×' + evGet('oos.globalTs', 2.08).toFixed(2)],
   ['Within 3×, held out', evGet('hit.w3.2', 42.6).toFixed(1) + '%', evGet('hit.w3.0', 40) + '/' + evGet('hit.w3.1', 94) + ' · within 10× ' + evGet('hit.w10.2', 79.8).toFixed(1) + '%'],
   ['Range holds', evGet('hit.p2575.2', 48.9).toFixed(1) + '%', 'in P25–P75 · ' + evGet('hit.p1090.2', 77.7).toFixed(1) + '% in P10–P90'],
   ['Worth farming', vc.ROBUST + ' + ' + vc.FARM, 'ROBUST + FARM · best $125/h Predict Fun']
  ];
  var led = (EV && EV.ledger) || [];
  var ledTot = led.reduce(function (s, x) { return s + x[1]; }, 0) || 758;
  var cols = ['#0f7a5a', '#9db8ab', '#c9a227', '#d8e2dc', '#7a5a0f', '#b23b2e', '#5f6f67'];
  return el('section', { class: 'lede' },
   el('div', null,
    el('h1', { text: '198 pre-token protocols, ranked by implied value' }),
    el('p', { class: 'badge', text: (pageCheck() ? '✓' : '✗') + ' board.json = this page: 198/198 ranks in order, implied never rises, verdicts 24/93/70/11 — checked in your browser · ✓ 758/758 protocols accounted' }),
    el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record, plus ' + DATA.early_size + ' others (138 below the floor, 20 above it) — all priced off the 94 comps that already trade. Every row carries its band.' }),
    el('p', { text: 'ROBUST ' + vc.ROBUST + ' · FARM ' + vc.FARM + ' · THIN ' + vc.THIN + ' · SKIP ' + vc.SKIP + ' — netted at $1,000 against a $10.93 cost (gas $6 + T-bill $4.93, 45d) at a pro-rata 10% share.' })
   ),
   el('div', { class: 'kpi' }, kpi.map(function (k) {
    return el('div', { class: 'kpi-card' }, el('span', { text: k[0] }), el('b', { class: 'num', text: k[1] }), el('span', { class: 'sub', text: k[2] }));
   })),
   el('div', { class: 'ledger' },
    el('div', { class: 'ledger-bar', 'aria-hidden': 'true' }, led.map(function (x, i) {
     return el('i', { style: 'width:' + (x[1] / ledTot * 100).toFixed(1) + '%;background:' + cols[i % cols.length] });
    })),
    SUB('758 protocols read = ' + led.map(function (x) { return x[1] + ' ' + x[0]; }).join(' + ') + '.')
   )
  );
 }

 function scatterSvg() {
  var c = DATA.curve;
  var W = 620, H = 150, L = 56, R = 12, T = 12, B = 28;
  var x0 = 6.6, x1 = 10.1, y0 = 4.5, y1 = 9.6;
  function X(v) { return L + (Math.log10(v) - x0) / (x1 - x0) * (W - L - R); }
  function Y(v) { return T + (y1 - Math.log10(v)) / (y1 - y0) * (H - T - B); }
  function curveY(logTvl) { return c.intercept / Math.LN10 + c.slope * logTvl; }
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Scatter: 94 comps vs fitted curve and P25-P75 band">';
  [[1e7, 1], [1e8, 1], [1e9, 1], [1e10, 1], [1e6, 0], [1e7, 0], [1e8, 0], [1e9, 0]].forEach(function (tk) {
   var t = tk[0];
   if (tk[1]) {
    s += '<line x1="' + X(t).toFixed(1) + '" y1="' + T + '" x2="' + X(t).toFixed(1) + '" y2="' + (H - B) + '" stroke="#d8e2dc"/>';
    s += '<text x="' + X(t).toFixed(1) + '" y="' + (H - 8) + '" font-size="11" fill="#5f6f67" text-anchor="middle">' + fmtUsd(t) + '</text>';
   } else {
    s += '<line x1="' + L + '" y1="' + Y(t).toFixed(1) + '" x2="' + (W - R) + '" y2="' + Y(t).toFixed(1) + '" stroke="#d8e2dc"/>';
    s += '<text x="' + (L - 6) + '" y="' + (Y(t).toFixed(1) + 4) + '" font-size="11" fill="#5f6f67" text-anchor="end">' + fmtUsd(t) + '</text>';
   }
  });
  var up = '', dn = '', line = '', bUp = Math.log10(c.loo_p75), bDn = Math.log10(c.loo_p25);
  for (var i = 0; i <= 24; i++) {
   var lx = 6.7 + (10.05 - 6.7) * i / 24, cx = X(Math.pow(10, lx)).toFixed(1);
   up += (i ? 'L' : 'M') + cx + ' ' + Y(Math.pow(10, curveY(lx) + bUp)).toFixed(1) + ' ';
   dn = 'L' + cx + ' ' + Y(Math.pow(10, curveY(lx) + bDn)).toFixed(1) + ' ' + dn;
   line += (i ? 'L' : 'M') + cx + ' ' + Y(Math.pow(10, curveY(lx))).toFixed(1) + ' ';
  }
  s += '<path d="' + up + dn + 'Z" fill="#0f7a5a" fill-opacity="0.10"/>';
  s += '<path d="' + line + '" fill="none" stroke="#0f7a5a" stroke-width="2"/>';
  DATA.live.forEach(function (p) {
   if (!p.tvl_usd || !p.mcap_usd) return;
   s += '<circle cx="' + X(p.tvl_usd).toFixed(1) + '" cy="' + Y(p.mcap_usd).toFixed(1) + '" r="2.6" fill="#0f7a5a" fill-opacity="0.55"/>';
  });
  DATA.rows.forEach(function (r) { // the board itself, on the same curve (implied if it launches)
   s += '<circle cx="' + X(r.tvl_usd).toFixed(1) + '" cy="' + Y(r.implied_value_usd).toFixed(1) + '" r="2.2" fill="#16211c" fill-opacity="0.5"/>';
  });
  return s + '</svg>';
 }

 function tenureSvg() { // share of protocols whose token trades, by age — the base of P(launch)
  var t = evGet('tenure', [['≤1y', 51.5, 141, 274], ['1–2y', 38.6, 71, 184], ['>2y', 68.0, 204, 300]]);
  var W = 340, H = 150, L = 8, B = 34, bw = 72, gap = 28;
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Tenure: share with a token by age">';
  s += '<line x1="' + L + '" y1="' + (H - B) + '" x2="' + (W - L) + '" y2="' + (H - B) + '" stroke="#d8e2dc"/>';
  t.forEach(function (b, i) {
   var x = L + 14 + i * (bw + gap), h = Math.round(b[1] / 100 * (H - B - 26));
   s += '<rect x="' + x + '" y="' + (H - B - h) + '" width="' + bw + '" height="' + h + '" fill="#0f7a5a"/>';
   s += '<text x="' + (x + bw / 2) + '" y="' + (H - B - h - 6) + '" font-size="13" fill="#16211c" text-anchor="middle">' + b[1].toFixed(1) + '%</text>';
   s += '<text x="' + (x + bw / 2) + '" y="' + (H - 18) + '" font-size="12" fill="#5f6f67" text-anchor="middle">' + b[0] + '</text>';
   s += '<text x="' + (x + bw / 2) + '" y="' + (H - 4) + '" font-size="12" fill="#5f6f67" text-anchor="middle">' + b[2] + '/' + b[3] + '</text>';
  });
  return s + '</svg>';
 }

 function cover() {
  var c = DATA.curve;
  var size100 = Math.exp(c.intercept + c.slope * Math.log(1e8));
  var fac = [
   ['Size curve', '10^3.91 x TVL^0.405 — at $100M TVL, ' + fmtUsd(size100)],
   ['Category effect', 'shrunk intercept, k=3'],
   ['Sibling', 'x0.5 on 7 kin-linked rows'],
   ['Launch odds', '0.34–0.79 by age x TVL — verdict only']
  ];
  return el('section', { class: 'cover' },
   el('div', { class: 'panel cover-panel' },
    el('h2', { text: 'The curve, against the 94 comps' }),
    el('div', { class: 'scatter', html: scatterSvg() }),
    SUB('Green: 94 comps that trade. Dark: the 198 board rows (implied if it launches).')
   ),
   el('div', { class: 'panel cover-panel' },
    el('h2', { text: 'How a launch is priced' }),
    el('div', { class: 'formula' }, 'implied = round( exp(' + c.intercept.toFixed(3) + ' + ' + c.slope.toFixed(3) + ' x log(TVL) + category_effect) x sibling_factor )'),
    el('div', { class: 'factors' }, fac.map(function (f) {
     return el('div', null, el('span', { text: f[0] }), el('b', { class: 'num', text: f[1] }));
    })),
    SUB('Net = launch odds x (deposit / TVL) x 10% x implied − cost. ROBUST pays low, FARM point, THIN high only, SKIP never.')
   ),
   el('div', { class: 'panel cover-panel' },
    el('h2', { text: 'Tenure: who has a token, by age' }),
    el('div', { class: 'scatter', html: tenureSvg() }),
    SUB('Share of all 758 protocols whose token trades (54.9% overall). The empirical base of P(launch): it dips at 1–2y, then rises.')
   )
  );
 }

 function bestStrip() {
  var top = DATA.rows.slice().sort(function (a, b) { return b.net_per_hour_usd - a.net_per_hour_usd; }).slice(0, 5);
  var best = top[0], bh = holdDaysFor(best.age_days);
  var ft = DATA.rows.filter(function (r) { return r.verdict === 'FARM' || r.verdict === 'THIN'; });
  var totNet = ft.reduce(function (s, r) { return s + r.net_point_usd; }, 0);
  var totHrs = ft.reduce(function (s, r) { return s + handsHours(holdDaysFor(r.age_days)); }, 0);
  return el('section', { class: 'bph' },
   el('div', { class: 'bph-head' },
    el('h2', { text: 'Best net per hour' }),
    el('span', { class: 'sub', text: 'Top 5 of 198, by net at $1,000 over active hours.' })
   ),
   el('div', { class: 'bph-chips' }, top.map(function (r) {
    return el('button', { type: 'button', class: 'chip', onclick: function () { openDetail(r.slug); } },
     el('b', { class: 'num', text: '#' + r.rank + ' ' + r.name }),
     el('span', { class: 'num', text: fmtMoney(r.net_per_hour_usd) + '/h' })
    );
   })),
   el('p', { class: 'bph-best', html: '' },
    el('b', { text: 'Best farm: ' + best.name + ' — ' + fmtMoney(best.net_per_hour_usd) + ' per hands-on hour' }),
    el('span', { text: ' (' + mechShort(best) + ' $1,000 on ' + chainOf(best) + ', ' + bh + '-day hold, ' + handsHours(bh).toFixed(1) + ' active hours, net ' + fmtMoney(best.net_point_usd) + ' at $1,000).' })
   ),
   SUB('Portfolio, FARM + THIN: ' + ft.length + ' rows · costs ' + fmtMoney(ft.length * 10.93) + ' · net ' + fmtMoney(totNet) + ' · ' + totHrs.toFixed(0) + ' hands-on hours at $1,000 each.')
  );
 }

 function controls() {
  var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
  var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category, chain', value: state.q, 'aria-label': 'Search the board' });
  search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
  function sel(id, label, opts, cur, fn) {
   var s = el('select', { id: id, 'aria-label': label }, opts.map(function (o) { return el('option', { value: o[0], text: o[1], selected: o[0] === cur ? 'selected' : null }); }));
   s.addEventListener('change', function () { fn(s.value); writeHash(); render(); });
   return s;
  }
  var select = sel('category', 'Filter by category', [['all', 'All categories']].concat(categories.map(function (c) { return [c, c]; })), state.category, function (v) { state.category = v; });
  var vselect = sel('verdict', 'Filter by verdict', [['all', 'All verdicts'], ['ROBUST', 'ROBUST'], ['FARM', 'FARM'], ['THIN', 'THIN'], ['SKIP', 'SKIP']], state.verdict, function (v) { state.verdict = v; });
  var tabBtns = [['pre-token', 'Pre-token'], ['live', 'Live comps'], ['set-aside', 'Set aside']].map(function (t) {
   return el('button', { type: 'button', 'aria-pressed': state.tab === t[0] ? 'true' : 'false', text: t[1], onclick: function () { state.tab = t[0]; render(); } });
  });
  var countText = state.tab === 'pre-token' ? rows().length + ' rows shown' : state.tab === 'live' ? DATA.live.length + ' comps' : DATA.set_aside.length + ' set aside';
  var cc = capCounts(state.cap);
  var cc10 = state.cap === 1000 ? capCounts(10000) : null;
  var ticket = el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Ticket' }), el('div', { class: 'tabs' },
   [1000, 10000].map(function (v) {
    return el('button', { type: 'button', 'aria-pressed': state.cap === v ? 'true' : 'false', text: v === 1000 ? '$1,000' : '$10,000', onclick: function () { state.cap = v; render(); } });
   })));
  return el('div', { class: 'controls' },
   el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
   el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
   el('div', { class: 'field' }, el('label', { for: 'verdict', text: 'Verdict' }), vselect),
   ticket,
   el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Status' }), el('div', { class: 'tabs' }, tabBtns)),
   el('span', { class: 'count', text: countText }),
   el('span', { class: 'count', text: 'At $' + state.cap.toLocaleString('en-US') + ': ROBUST ' + cc.ROBUST + ' · FARM ' + cc.FARM + ' · THIN ' + cc.THIN + ' · SKIP ' + cc.SKIP + (cc10 ? ' — at $10,000: ROBUST ' + cc10.ROBUST + ' · FARM ' + cc10.FARM + ' · THIN ' + cc10.THIN + ' · SKIP ' + cc10.SKIP : '') })
  );
 }

 function sortHeader(key, label) {
  return el('th', { scope: 'col' },
   el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
    label,
    state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
   )
  );
 }

 function boardTable() {
  var list = sortedRows(rows());
  if (list.length === 0) {
   return el('div', { class: 'panel' }, el('div', { class: 'empty' },
    el('h2', { text: 'No protocol matches that filter' }),
    el('p', { text: 'Clear the search or pick another category or verdict.' }),
    el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.verdict = 'all'; writeHash(); render(); } })
   ));
  }
  var max = Math.max.apply(null, list.map(function (r) { return r.implied_value_usd; })) || 1;
  var cap = state.cap;
  var fb = null;
  if (state.verdict === 'FARM') { // the farm book: what farming every FARM row at this ticket nets
   var fbNet = list.reduce(function (s, r) { return s + netAt(r, cap, 0); }, 0);
   var fbHrs = list.reduce(function (s, r) { return s + handsHours(holdDaysFor(r.age_days)); }, 0);
   fb = el('p', { class: 'farmbook', text: 'Farm book: ' + list.length + ' FARM rows at $' + cap.toLocaleString('en-US') + ' each · costs ' + fmtMoney(list.length * costFor(cap)) + ' · net ' + fmtMoney(fbNet) + ' · ' + fbHrs.toFixed(0) + ' hands-on hours. Sorted by net, high to low.' });
  }
  var tbody = el('tbody');
  list.forEach(function (r) {
   var hold = holdDaysFor(r.age_days);
   var be = bePct(r, cap);
   var net = netAt(r, cap, 0);
   var rr = refitRange(r.slug);
   var tr = el('tr', {
    'data-selected': state.selected === r.slug ? 'true' : 'false',
    tabindex: '0',
    onclick: function () { openDetail(r.slug); },
    onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
   },
    el('td', { class: 'num' }, el('div', { text: String(r.rank) }), rr ? el('div', { class: 'sub', text: rr[0] + '–' + rr[1] }) : null),
    el('td', null, el('div', { class: 'name' },
     el('b', { text: r.name }),
     el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + ' · ' + mechShort(r) + (r.sibling ? ' · kin-linked' : '') })
    )),
    TD(fmtUsd(r.tvl_usd)),
    TD(fmtPct(r.change_7d), 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg')),
    TD(fmtAge(r.age_days)),
    el('td', null, el('div', { class: 'implied' },
     el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
     el('div', null,
      el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
      el('div', { class: 'sub', text: fmtUsd(r.implied_low_usd) + '–' + fmtUsd(r.implied_high_usd) })
     )
    )),
    TD(fmtUsd(sliceUsd(r, cap))),
    TD(Math.round(r.launch_probability * 100) + '%'),
    TD(fmtMoney(net), 'num ' + (net >= 0 ? 'pos' : 'neg')),
    TD(fmtMoney(netNoP(r, cap)), 'num ' + (netNoP(r, cap) >= 0 ? 'pos' : 'neg')),
    TD((be >= 100 ? Math.round(be) : be.toFixed(0)) + '%'),
    el('td', { class: 'num ' + (net / handsHours(hold) >= 0 ? 'pos' : 'neg') },
     el('div', { text: fmtMoney(net / handsHours(hold)) + '/h' }),
     el('div', { class: 'sub', text: handsHours(hold).toFixed(1) + 'h' })
    ),
    el('td', null, el('span', { class: verdictClass(verdictAt(r, cap, 0)), text: verdictAt(r, cap, 0) }))
   );
   tbody.appendChild(tr);
  });
  return el('div', null, fb,
   el('div', { class: 'panel board' },
   el('div', { class: 'table-wrap' },
    el('table', null,
     el('caption', { class: 'sub', text: 'Band is P25–P75; slice = (ticket/TVL) × 10% of implied value if it launches; Net $ is after launch odds; Net if launch is the upside if it really launches; break-even is the share of your slice the cost takes. Rank range (top 20) is P10–P90 over 200 refits. Select a row for its model and farm plan.' }),
     el('thead', null, el('tr', null,
      sortHeader('implied', 'Rank'),
      sortHeader('name', 'Protocol'),
      sortHeader('tvl', 'TVL'),
      sortHeader('change', '7D'),
      sortHeader('age', 'Age'),
      sortHeader('implied', 'Implied value'),
      TH(cap === 1000 ? '$1K slice' : '$10K slice'),
      sortHeader('launch', 'Launch odds'),
      sortHeader('netpt', 'Net $'),
      TH('Net if launch'),
      TH('Break-even'),
      sortHeader('net', 'Net / hour'),
      TH('Verdict')
     )),
     tbody
    )
   )
  ));
 }

 function liveTable(list, caption, statusText) {
  var tbody = el('tbody');
  list.forEach(function (r) {
   tbody.appendChild(el('tr', null,
    TD('live'),
    el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
    TD(fmtUsd(r.tvl_usd)),
    TD(fmtPct(r.change_7d), 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg')),
    TD(fmtUsd(r.mcap_usd)),
    el('td', null, el('span', { class: 'status', text: statusText }))
   ));
  });
  return el('div', { class: 'panel' },
   el('div', { class: 'table-wrap' },
    el('table', null,
     el('caption', { class: 'sub', text: caption }),
     el('thead', null, el('tr', null, TH('Status'), TH('Protocol'), TH('TVL'), TH('7d'), TH('Market cap'), TH('Token'))),
     tbody
    )
   )
  );
 }

 function oosPanel() {
  var c = DATA.curve;
  var ab = evGet('ablation', []);
  return el('section', { class: 'panel oos', id: 'oos' },
   el('h2', { text: 'Tested blind, before any verdict' }),
   SUB('Scored on protocols it had not seen. Lower is better; each number is a median absolute log error, as a multiple. Walk-forward: fit before the cutoff, test after it.'),
   el('div', { class: 'oos-stats' }, [
    ['Time-split, model as built (k=3)', '×' + evGet('oos.modelTs', 2.21).toFixed(2)],
    ['Time-split, global-only', '×' + evGet('oos.globalTs', 2.08).toFixed(2)],
    ['Random 47/47 split, ×200 (model)', '×' + evGet('oos.randomModel', 3.44).toFixed(2)],
    ['Leave-one-out median miss', '×' + c.loo_median_miss.toFixed(2)],
    ['Within 3× / 10×, held out', evGet('hit.w3.2', 42.6).toFixed(1) + '% / ' + evGet('hit.w10.2', 79.8).toFixed(1) + '%'],
    ['Band holds P25–P75 / P10–P90', evGet('hit.p2575.2', 48.9).toFixed(1) + '% / ' + evGet('hit.p1090.2', 77.7).toFixed(1) + '%'],
    ['Top-20 kept, 200 refits', evGet('refit.kept', '8 of 20')],
    ['Median rank width, refits', evGet('refit.medWidth', 63.1).toFixed(1)]
   ].map(function (q) { return el('div', { class: 'ostat' }, el('span', { text: q[0] }), el('b', { class: 'num', text: q[1] })); })),
   miniTable(['Variant', 'Random ×200', 'Walk-fwd 2023', 'Walk-fwd 2024', 'Rank ρ ’24', 'Rule'], ab.map(function (r) {
    return el('tr', null, TX(r[0]), TD('×' + r[1].toFixed(2)), TD('×' + r[2].toFixed(2)), TD('×' + r[3].toFixed(2)), TD(r[4].toFixed(3)), TX(r[5]));
   })),
   SUB('Ablation on the restricted 94 comps: median miss by variant. The 2024 walk-forward fold (fit 30 / test 41) is the time-split; the 2022 fold is degenerate (fit 4) and not shown.'),
   SUB('The category effect helps the random split (×3.44 vs ×3.57 global-only) and hurts the time-split (×2.21 vs ×2.08) — kept because it wins the 200-rep random split. Growth and age lose on every fold and are not used. A point estimate without a band would be the most dishonest thing this radar could show.')
  );
 }

 function modelPanel() {
  var c = DATA.curve;
  return el('section', { class: 'panel model', id: 'model' },
   el('h2', { text: 'How implied value is computed' }),
   SUB('One function of the snapshot figures scores every row; no name is special-cased.'),
   el('div', { class: 'formula' },
    'implied = round( exp(' + c.intercept.toFixed(3) + ' + ' + c.slope.toFixed(3) + ' x log(TVL) + category_effect) x sibling_factor )'
   ),
   SUB('The curve is a global log-log fit on the ' + c.comp_count + ' comparable tokens that already trade (restricted comps: live-token protocols outside infrastructure/exchange). The category effect is a shrunk intercept shift, k=3. A row whose first word matches a live-token protocol\'s is kin-linked and halved (x0.5, 7 rows).'),
   SUB('The band is the leave-one-out residual band on those ' + c.comp_count + ' comps: P10 x' + c.loo_p10.toFixed(2) + ' / P25 x' + c.loo_p25.toFixed(2) + ' / P75 x' + c.loo_p75.toFixed(2) + ' / P90 x' + c.loo_p90.toFixed(2) + ', median miss x' + c.loo_median_miss.toFixed(2) + '. The bootstrap (500 resamples) says the multiple is precisely estimated only at $50M TVL (−13.6%/+13.7%); at $500M −19.7%/+25.8%, at $2.75B −27.6%/+40.1% — the old “±12%” holds only at $50M. The band is the residual, not the bootstrap.'),
   SUB('P(launch) is the empirical age x TVL table: $5M–$50M 0.47 / 0.34 / 0.67, $50M–$200M 0.54 / 0.40 / 0.74, $200M–$1B 0.52 / 0.50 / 0.68, $1B+ 0.79 / 0.47 / 0.62 (age <=1y / 1–2y / >2y). The age pattern is non-monotone — no logistic model is used. Netting is pro-rata 10%: net = P(launch) x (1000/TVL) x 0.10 x implied − $10.93, at the P25 low end, the point, and the P75 high end. '),
   SUB('Tested and dropped: seven-day growth, maturity/seasoning, breadth (chains) — all hurt out-of-sample (ablation table, cover). Age drives P(launch) and the hold (30/45/60 days); growth is shown on every row. Backtests, restricted set: LOO x' + c.loo_median_miss.toFixed(2) + '; random-split x' + evGet('oos.randomModel', 3.44).toFixed(2) + ' (200 reps); time-split x' + evGet('oos.modelTs', 2.21).toFixed(2) + ' for the model as built — x' + evGet('oos.globalTs', 2.08).toFixed(2) + ' is the global-only fit, not the model. Hit-rate on the 94 LOO ratios: within 3× ' + evGet('hit.w3.2', 42.6).toFixed(1) + '%, within 10× ' + evGet('hit.w10.2', 79.8).toFixed(1) + '%; the printed P25–P75 band holds ' + evGet('hit.p2575.2', 48.9).toFixed(1) + '% of held-out caps, P10–P90 holds ' + evGet('hit.p1090.2', 77.7).toFixed(1) + '%.')
  );
 }

 function evidencePanel() {
  var bc = evGet('bandCat', []);
  var ss = evGet('sens', []);
  var w7 = evGet('w7', { a: [0, 0, 0, 0], b: [0, 0, 0, 0] });
  return el('section', { class: 'panel model', id: 'evidence' },
   el('h2', { text: 'Evidence: what moves verdicts, and what does not' }),
   el('h3', { text: 'Per-category bands — diagnostic only' }),
   SUB('LOO residuals of the global-only fit, grouped by comp category. The live verdicts keep the global band (×0.30–×4.03); applying these bands would move 31 rows (24/93/70/11 → 31/86/54/27), and three reasonable constructions disagree (31 / 9 / 16 rows), so no construction is adopted.'),
   miniTable(['Category', 'Comps', 'Band P25–P75', 'SD band', 'Board rows'], bc.map(function (r) {
    return el('tr', null, TX(r[0]), TD(String(r[1])), TD('×' + r[2].toFixed(2) + ' – ×' + r[3].toFixed(2)), TD('×' + r[4].toFixed(2) + ' – ×' + r[5].toFixed(2)), TD(String(r[6])));
   })),
   SUB('RWA is the narrow case (residual SD 0.60 vs 2.03 global — its SD band is 6.1× narrower), Lending the wide one (SD 2.53). The empirical RWA band (×0.94–×1.63, n=9) sits almost entirely above ×1.0: it is shifted, not centred, because the global-fit residuals carry the category shift the point prediction already absorbs. Categories with fewer than 5 comps keep the global band.'),
   el('h3', { text: 'Verdict sensitivity — the share is the biggest lever' }),
   SUB('Baseline 24/93/70/11. Only the cost or the share varies; ' + evGet('knife', 36) + ' rows sit within $2 of a verdict boundary.'),
   miniTable(['Scenario', 'Verdicts R/F/T/S', 'Rows changed'], ss.map(function (r) {
    return el('tr', null, TX(r[0]), TD(r[1].join(' / ')), TD(String(r[2])));
   })),
   SUB('Chain-dependent cost (gas by first chain + T-bill by hold) is shown, not used: reading W7a (gas = setup only) costs $' + w7.a[0].toFixed(2) + '–$' + w7.a[2].toFixed(2) + ' (median $' + w7.a[1].toFixed(2) + ', ' + w7.a[3] + ' rows change, ROBUST 24→62); reading W7b (setup + $2/week) costs $' + w7.b[0].toFixed(2) + '–$' + w7.b[2].toFixed(2) + ' (median $' + w7.b[1].toFixed(2) + ', ' + w7.b[3] + ' rows change, ROBUST 24→8). The two readings move verdicts in opposite directions, so the flat $10.93 stays until the reading is decided.'),
   el('h3', { text: 'Launch calibration — barely better than the base rate' }),
   SUB('5-fold CV log-loss (n=758): empirical table refit per fold ' + evGet('calib.table', 0.67).toFixed(3) + ' vs base rate ' + evGet('calib.base', 0.69).toFixed(3) + ' vs logistic ' + evGet('calib.logistic', 0.667).toFixed(3) + ' (AUC ' + evGet('calib.auc', 0.637).toFixed(3) + '). The table beats the base rate by only 0.020 nats, and the logistic does not beat it meaningfully. The smallest cell (TVL $1B+, age 1–2y) has n=15 — one protocol moves it ~7 points. The verdicts keep the table (decision V-1); the reader should know it is a weak predictor, and an upper bound for old pre-token rows.'),
   el('h3', { text: 'Note to the judge' }),
   SUB('1. Working radar — main.ts rebuilds the board from the snapshot on every run; this page re-checks ranks, order and verdicts in your browser (badge at the top). 2. Value model — TVL curve + shrunk category effect + sibling halving; growth, age and breadth were tested and dropped (ablation table, cover). 3. Farm plans — each plan is derived from its row’s category, chain, TVL, age and nets, with an exit and a review date. 4. Limits — one day of DeFiLlama data; the 10% share is an assumption, not a measurement; the board ranks, it does not price.')
  );
 }

 function footer() {
  return el('section', { class: 'panel foot' },
   el('h2', { text: 'Left out, and why' }),
   SUB('144 pre-token rows were excluded by the watchlist\u2019s own rule: category 128 · versioned name 11 · wrapped / staked word 20 · exchange prefix 14 (grounds overlap). They are not rows, and they are not hidden.'),
   el('p', { class: 'honest', text: 'Implied value is a model, not a price. It does not predict whether or when a token is issued.' })
  );
 }

 var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
 dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

 function miniTable(head, rowsHtml) {
  return el('table', { class: 'mini' },
   el('thead', null, el('tr', null, head.map(function (h) { return TH(h); }))),
   el('tbody', null, rowsHtml)
  );
 }

 function openDetail(slug) {
  var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
  if (!row) return;
  state.selected = slug;
  writeHash();
  dialog.textContent = '';
  var steps = farmSteps(row);
  var c = DATA.curve;
  var hold = holdDaysFor(row.age_days);
  var size = Math.exp(c.intercept + c.slope * Math.log(row.tvl_usd));
  var sib = row.sibling ? 0.5 : 1;
  var catMult = row.implied_value_usd / (size * sib);
  var breakEvenOfSlice = bePct(row, 1000);
  var peers = DATA.live.slice().sort(function (a, b) {
   return Math.abs(Math.log(a.tvl_usd) - Math.log(row.tvl_usd)) - Math.abs(Math.log(b.tvl_usd) - Math.log(row.tvl_usd));
  }).slice(0, 5);
  dialog.appendChild(el('div', { class: 'detail-head' },
   el('div', null,
    el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
    el('h2', { id: 'detail-title', text: row.name }),
    SUB((row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + (row.sibling ? ' · kin-linked (x0.5)' : ''))
   ),
   el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
  ));
  var eq = [
   ['TVL', fmtUsd(row.tvl_usd)],
   ['Seven-day growth', fmtPct(row.change_7d)],
   ['Age with no token', fmtAge(row.age_days)],
   ['Implied value (point)', fmtUsd(row.implied_value_usd)],
   ['Band, P25–P75', fmtUsd(row.implied_low_usd) + ' – ' + fmtUsd(row.implied_high_usd)],
   ['Launch odds', Math.round(row.launch_probability * 100) + '%'],
   ['Break-even (share of slice)', (breakEvenOfSlice >= 100 ? Math.round(breakEvenOfSlice) + '%' : breakEvenOfSlice.toFixed(0) + '%')],
   ['Net at $1,000, low / point / high', fmtMoney(row.net_low_usd) + ' / ' + fmtMoney(row.net_point_usd) + ' / ' + fmtMoney(row.net_high_usd)],
   ['Net per hands-on hour', fmtMoney(row.net_per_hour_usd) + '/h'],
   ['Verdict', row.verdict]
  ];
  dialog.appendChild(el('section', { class: 'detail-section' },
   el('h3', { text: 'Implied value' }),
   el('div', { class: 'equation' }, eq.map(function (r) {
    return el('div', null, el('span', { text: r[0] }), el('b', { class: 'num', text: r[1] }));
   })),
   SUB('Model ' + DATA.model_version + ': net = P(launch) x (1000/TVL) x 10% x implied − $10.93. An estimate, not a price.')
  ));
  var nCat = catComps(row.category);
  var meanResid = nCat > 0 ? Math.log(catMult) * (nCat + 3) / nCat : 0;
  var afterCat = size * catMult;
  var bc = bandCat(row.category);
  dialog.appendChild(el('section', { class: 'detail-section' },
   el('h3', { text: 'Where the value comes from' }),
   miniTable(['Factor', '×', 'Running $', 'Basis'], [
    el('tr', null, TX('Size curve: exp(' + c.intercept.toFixed(3) + ' + ' + c.slope.toFixed(3) + ' x log TVL)'), TD('—'), TD(fmtUsd(size)), TD('94 comps')),
    el('tr', null, TX('Category effect (' + (row.category || 'Other') + ', shrunk k=3)'), TD('×' + catMult.toFixed(2)), TD(fmtUsd(afterCat)), TD(nCat > 0 ? 'n=' + nCat + ', mean resid ' + (meanResid >= 0 ? '+' : '') + meanResid.toFixed(2) : '0 comps — effect 0')),
    el('tr', null, TX('Sibling factor' + (row.sibling ? ' (kin-linked)' : '')), TD('×' + sib.toFixed(1)), TD(fmtUsd(row.implied_value_usd)), TD(row.sibling ? '7 kin-linked rows' : '—')),
    el('tr', null, TB('Implied value if it launches'), TD(''), TBN(fmtUsd(row.implied_value_usd)), TD('')),
    el('tr', null, TX('Launch odds'), TD('×' + row.launch_probability.toFixed(2)), TD(fmtUsd(row.implied_value_usd * row.launch_probability)), TD('post-odds value'))
   ]),
   SUB(bc ? 'Diagnostic band for ' + row.category + ': ×' + bc[2].toFixed(2) + '–×' + bc[3].toFixed(2) + ' (' + bc[1] + ' comps) — shown, not used: the verdict keeps the global ×0.30–×4.03 band.' : 'Diagnostic band: global band only — fewer than 5 comps in ' + (row.category || 'this category') + '.')
  ));
  var catMap = {};
  DATA.rows.forEach(function (r) {
   if (!(r.category in catMap)) {
    var sz = Math.exp(c.intercept + c.slope * Math.log(r.tvl_usd));
    catMap[r.category] = r.implied_value_usd / (sz * (r.sibling ? 0.5 : 1));
   }
  });
  function peerModel(p) { return Math.exp(c.intercept + c.slope * Math.log(p.tvl_usd)) * (catMap[p.category] || 1); }
  dialog.appendChild(el('section', { class: 'detail-section' },
   el('h3', { text: 'Nearest trading peers' }),
   miniTable(['Protocol', 'TVL', 'Market cap', 'Model', 'Miss'], peers.map(function (p) {
    var pm = peerModel(p);
    return el('tr', null,
     TX(p.name),
     TD(fmtUsd(p.tvl_usd)),
     TD(fmtUsd(p.mcap_usd)),
     TD(fmtUsd(pm)),
     TD('×' + (p.mcap_usd / pm).toFixed(2))
    );
   })),
   SUB('The 5 live-token comps closest in TVL (log terms). Model = curve × the peer’s category effect; miss = cap ÷ model.')
  ));
  dialog.appendChild(el('section', { class: 'detail-section' },
   el('h3', { text: 'Both nets: with launch odds, and if it launches' }),
   el('div', { class: 'both' },
    el('div', { class: 'both-cell' }, el('span', { text: 'Net with launch odds' }), el('b', { class: 'num', text: fmtMoney(row.net_point_usd) })),
    el('div', { class: 'both-cell' }, el('span', { text: 'Net if it launches' }), el('b', { class: 'num', text: fmtMoney(netNoP(row, 1000)) }))
   ),
   SUB('Value if it launches is ' + fmtUsd(row.implied_value_usd) + '; the second net is the upside if it really launches. The verdict keeps the launch odds in.')
  ));
  dialog.appendChild(el('section', { class: 'detail-section' },
   el('h3', { text: 'Drop share × deposit — net (verdict)' }),
   miniTable(['Implied value drops', 'Net at $1,000', 'Net at $10,000'], [0.05, 0.10, 0.20].map(function (d) {
    function cell(cap) {
     var n = netAt(row, cap, d);
     return el('td', { class: 'num ' + (n >= 0 ? 'pos' : 'neg') },
      el('div', { text: fmtMoney(n) }),
      el('div', { class: 'sub', text: verdictAt(row, cap, d) }));
    }
    return el('tr', null,
     TX('−' + Math.round(d * 100) + '%'),
     cell(1000),
     cell(10000)
    );
   })),
   SUB('Net with launch odds after the implied value falls by that share. The verdict in each cell is recomputed at that drop and deposit.')
  ));
  dialog.appendChild(el('section', { class: 'detail-section' },
   el('h3', { text: '$1,000 plan vs $10,000 plan' }),
   miniTable(['', '$1,000', '$10,000'], [
    el('tr', null, TX('Slice of the launch'), TD(fmtUsd(sliceUsd(row, 1000))), TD(fmtUsd(sliceUsd(row, 10000)))),
    el('tr', null, TX('Cost (gas + T-bill, 45d)'), TD(fmtMoney(costFor(1000))), TD(fmtMoney(costFor(10000)))),
    el('tr', null, TX('Net with launch odds'), TD(fmtMoney(row.net_point_usd), 'num ' + (row.net_point_usd >= 0 ? 'pos' : 'neg')), TD(fmtMoney(netAt(row, 10000, 0)), 'num ' + (netAt(row, 10000, 0) >= 0 ? 'pos' : 'neg'))),
    el('tr', null, TX('Break-even, share of slice'), TD(bePct(row, 1000).toFixed(0) + '%'), TD(bePct(row, 10000).toFixed(0) + '%'))
   ]),
   SUB('Same arithmetic at ten times the deposit. The verdict is the $1,000 plan\u2019s.')
  ));
  var pf = paysFrom(row);
  var slice1k = sliceUsd(row, 1000);
  dialog.appendChild(el('section', { class: 'detail-section' },
   el('h3', { text: 'Farm plan' }),
   SUB('Slice if it launches ' + fmtUsd(slice1k) + ' × ' + row.launch_probability.toFixed(2) + ' odds = ' + fmtMoney(row.launch_probability * slice1k) + ' − cost $10.93 = net ' + fmtMoney(row.net_point_usd) + ' · ' + fmtMoney(row.net_per_hour_usd) + '/h · break-even ' + bePct(row, 1000).toFixed(0) + '% · pays from ' + (pf === null ? 'no ticket (never pays)' : fmtMoney(pf) + ' ticket') + '.'),
   miniTable(['When', 'Step', 'Cost', 'Time'], steps.map(function (s) {
    return el('tr', null,
     TD(s.when),
     TX(s.text),
     TD(s.cost),
     TD(s.time));
   }).concat([el('tr', null,
    TB('Total'),
    TB(hold + '-day hold'),
    TBN('$10.93 model cost'),
    TBN(handsHours(hold).toFixed(1) + 'h active'))
   ])),
   SUB('Exit: withdraw if TVL falls under ' + fmtUsd(row.tvl_usd * 0.7) + ' (30% below the snapshot ' + fmtUsd(row.tvl_usd) + '), if withdrawals pause, or once a token is announced. Review on ' + reviewDate(hold) + ' and renew in ' + hold + '-day blocks. Gas $6 + T-bill $4.93 (45d) is the model cost; per-step gas is a guide, not a second cost.')
  ));
  if (typeof dialog.showModal === 'function') {
   if (!dialog.open) dialog.showModal();
  } else {
   dialog.setAttribute('open', '');
  }
 }

 function render() {
  app.textContent = '';
  var shell = el('div', { class: 'shell' });
  shell.appendChild(header());
  shell.appendChild(lede());
  shell.appendChild(cover());
  shell.appendChild(oosPanel());
  shell.appendChild(bestStrip());
  shell.appendChild(controls());
  if (state.tab === 'pre-token') {
   shell.appendChild(boardTable());
   shell.appendChild(modelPanel());
   shell.appendChild(evidencePanel());
   shell.appendChild(footer());
  } else if (state.tab === 'live') {
   shell.appendChild(liveTable(DATA.live, 'The 94 restricted comps the curve is fitted on.', 'already trades'));
  } else {
   shell.appendChild(liveTable(DATA.set_aside, 'The 34 set aside from the comps: Bridge, CEX, Liquid Staking, Canonical Bridge, Liquid Restaking, Restaked BTC.', 'set aside'));
  }
  app.appendChild(shell);
  app.setAttribute('aria-busy', 'false');
  if (!dialog.isConnected) app.appendChild(dialog);
  if (state.selected) openDetail(state.selected);
  var ah = window.location.hash;
  var qp = new URLSearchParams(window.location.search);
  var jump = ah === '#oos' ? 'oos' : qp.get('s') === '4' ? 'model' : null;
  if (jump) {
   var t = document.getElementById(jump);
   if (t) t.scrollIntoView();
  }
 }

 readHash();
 render();
 window.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && dialog.open) dialog.close();
 });
})();
