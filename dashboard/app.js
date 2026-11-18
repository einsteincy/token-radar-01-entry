// Token Radar dashboard (round-2 model + P2 presentation). Reads window.RADAR (written by
// main.ts) and renders the board, curve scatter, formula, blind-test panel, detail view and
// model note. No network: every byte shown is in data.js. Model: global log-log curve on the
// 94 comps, shrunk (k=3) category intercept, x0.5 sibling factor, LOO band, empirical launch
// table, pro-rata 10% netting into four verdicts. Growth, maturity and breadth were tested
// and dropped (they hurt out-of-sample); age drives P(launch) and the hold, not value.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', verdict: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

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

  // Farm plan: the same derivation main.ts writes to board.json (category, chains, TVL, age
  // decide action/capital/hold/cost/time; verdict and nets decide the walk-away). No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function handsHours(hold) { return (35 + 10 * (hold / 7)) / 60; }
  // One table drives the farm action and the short mechanism label: category keywords,
  // short label, action template ({N} name, {C} chain). No name is special-cased.
  var ACTS = [
    ['lend|cdp|collateral', 'Supply', 'Supply $1,000 of USDC to {N} on {C} and keep the position open.'],
    ['dex|yield|leveraged farm', 'Provide liquidity', "Provide $1,000 of liquidity to {N}'s main pool on {C} and keep the position open."],
    ['bridge', 'Bridge', 'Bridge $1,000 of USDC to {C} through {N} and use the bridged funds in its app.'],
    ['staking|restak', 'Stake', "Stake $1,000 of the chain's staking asset through {N} and keep the receipt."],
    ['perpetual|derivative', 'Deposit margin', 'Deposit $1,000 of USDC as margin on {N} and open one small hedge.'],
    ['prediction', 'Fund a market', 'Fund $1,000 and place one market position on {N}.'],
    ['curator|allocator', 'Deposit in vault', 'Deposit $1,000 into a {N} vault on {C} and keep the shares.'],
    ['stable', 'Mint / deposit', 'Mint or deposit $1,000 of the stable asset through {N} on {C}.'],
    ['rwa', 'Mint yield asset', "Mint $1,000 of the protocol's yield asset on {C} and hold it."],
    ['insurance', 'Buy cover', 'Buy $1,000 of cover from {N} on {C} and keep the policy.']
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
  // Netting, same as the model: cost is gas $6 + T-bill 4% on the capital for 45 days, so
  // $10.93 at $1,000 — the $1,000 figures here reproduce the board's own nets exactly.
  function sliceUsd(r, cap) { return (cap / r.tvl_usd) * 0.10 * r.implied_value_usd; }
  function costFor(cap) { return 6 + cap * 0.04 * 45 / 365; }
  function netAt(r, cap, drop) { return r.launch_probability * sliceUsd(r, cap) * (1 - drop) - costFor(cap); }
  function netNoP(r, cap) { return sliceUsd(r, cap) - costFor(cap); }
  function bePct(r, cap) {
    var s = (cap / r.tvl_usd) * 0.10;
    return costFor(cap) / (r.launch_probability * r.implied_value_usd) / s * 100;
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
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
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, chain), cost: '$1,000 of capital and about $3 of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $1,000 stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: walkAway + ' Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
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
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var c = DATA.curve;
    var vc = DATA.verdict_counts;
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: '198 pre-token protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record, plus ' + DATA.early_size + ' pre-token protocols below that floor — all priced off the ' + c.comp_count + ' comparable tokens that already trade. Every row carries its band.' }),
        el('p', { text: 'ROBUST ' + vc.ROBUST + ' · FARM ' + vc.FARM + ' · THIN ' + vc.THIN + ' · SKIP ' + vc.SKIP + ' — netted at $1,000 against a $10.93 cost (gas $6 + T-bill $4.93, 45d) at a pro-rata 10% share.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Curve' }), el('b', { text: c.intercept.toFixed(3) + ' + ' + c.slope.toFixed(3) + ' log(TVL)' })),
        el('div', { class: 'fact' }, el('span', { text: 'Time-split OOS' }), el('b', { text: 'x2.08' })),
        el('div', { class: 'fact' }, el('span', { text: 'LOO band, P25–P75' }), el('b', { text: 'x' + c.loo_p25.toFixed(2) + ' – x' + c.loo_p75.toFixed(2) })),
        el('div', { class: 'fact' }, el('span', { text: 'LOO median miss' }), el('b', { text: 'x' + c.loo_median_miss.toFixed(2) })),
      )
    );
  }

  // Scatter: 94 comps (TVL vs mcap, log-log) + curve + P25–P75 band, from DATA.live/curve.
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
    // P25–P75 band (x0.30 / x4.03) + fitted curve, one pass.
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
        el('div', { class: 'scatter', html: scatterSvg() })
      ),
      el('div', { class: 'panel cover-panel' },
        el('h2', { text: 'How a launch is priced' }),
        el('div', { class: 'formula' }, 'implied = round( exp(' + c.intercept.toFixed(3) + ' + ' + c.slope.toFixed(3) + ' x log(TVL) + category_effect) x sibling_factor )'),
        el('div', { class: 'factors' }, fac.map(function (f) {
          return el('div', null, el('span', { text: f[0] }), el('b', { class: 'num', text: f[1] }));
        })),
        el('p', { class: 'sub', text: 'Net = launch odds x (deposit / TVL) x 10% x implied − cost. ROBUST pays low, FARM point, THIN high only, SKIP never.' })
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
        el('h2', { text: 'Best net per hands-on hour' }),
        el('span', { class: 'sub', text: 'Top 5 of 198, by net at $1,000 over the plan\u2019s active hours (the hold is passive).' })
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
      el('p', { class: 'sub', text: 'Portfolio, FARM + THIN: ' + ft.length + ' rows · costs ' + fmtMoney(ft.length * 10.93) + ' · net ' + fmtMoney(totNet) + ' · ' + totHrs.toFixed(0) + ' hands-on hours at $1,000 each.' })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
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
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'verdict', text: 'Verdict' }), vselect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, tabBtns)),
      el('span', { class: 'count', text: countText })
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
    var tbody = el('tbody');
    list.forEach(function (r) {
      var hold = holdDaysFor(r.age_days);
      var slice = (1000 / r.tvl_usd) * 0.10;
      var be = r.break_even_share / slice * 100;
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + ' · ' + mechShort(r) + (r.sibling ? ' · kin-linked' : '') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('div', null,
            el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
            el('div', { class: 'sub', text: fmtUsd(r.implied_low_usd) + '–' + fmtUsd(r.implied_high_usd) })
          )
        )),
        el('td', { class: 'num', text: fmtUsd(sliceUsd(r, 1000)) }),
        el('td', { class: 'num', text: Math.round(r.launch_probability * 100) + '%' }),
        el('td', { class: 'num ' + (r.net_point_usd >= 0 ? 'pos' : 'neg'), text: fmtMoney(r.net_point_usd) }),
        el('td', { class: 'num', text: (be >= 100 ? Math.round(be) : be.toFixed(0)) + '%' }),
        el('td', { class: 'num ' + (r.net_per_hour_usd >= 0 ? 'pos' : 'neg') },
          el('div', { text: fmtMoney(r.net_per_hour_usd) + '/h' }),
          el('div', { class: 'sub', text: handsHours(hold).toFixed(1) + 'h' })
        ),
        el('td', null, el('span', { class: verdictClass(r.verdict), text: r.verdict }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel board' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Strongest implied value first. Band is P25–P75; $1K slice = (1000/TVL) x 10% of implied value; break-even is the share of your slice the $10.93 cost takes. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('change', '7D'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: '$1K slice' }),
            sortHeader('launch', 'Launch odds'),
            sortHeader('net', 'Net $'),
            el('th', { scope: 'col', text: 'Break-even' }),
            sortHeader('net', 'Net / hour'),
            el('th', { scope: 'col', text: 'Verdict' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable(list, caption, statusText) {
    var tbody = el('tbody');
    list.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: statusText }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: caption }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  // Blind-test panel: OOS numbers + ablation. Full-set rows use 128 comps; the last row is the model as built (restricted 94 + k=3).
  function oosPanel() {
    var c = DATA.curve;
    var ab = [
      ['Global only', 'x3.71', 'x2.91'],
      ['+ category k=3', 'x3.68', 'x2.93'],
      ['+ growth', 'x3.73', 'x4.39'],
      ['+ age', 'x3.85', 'x3.43'],
      ['+ breadth (chains)', 'x3.89', 'x2.94']
    ];
    return el('section', { class: 'panel oos', id: 'oos' },
      el('h2', { text: 'Tested blind, before any verdict' }),
      el('p', { class: 'sub', text: 'Scored on protocols it had not seen. Lower is better; each number is a median absolute log error, as a multiple.' }),
      el('div', { class: 'oos-stats' }, [
        ['Time-split (fit pre-2024, test 2024+)', 'x2.08'],
        ['Random 64/64 split, x200', 'x3.53'],
        ['Leave-one-out median miss', 'x' + c.loo_median_miss.toFixed(2)],
        ['LOO band, P10–P90', 'x' + c.loo_p10.toFixed(2) + ' – x' + c.loo_p90.toFixed(2)]
      ].map(function (q) { return el('div', { class: 'ostat' }, el('span', { text: q[0] }), el('b', { class: 'num', text: q[1] })); })),
      el('table', { class: 'mini ablation' },
        el('caption', { class: 'sub', text: 'Ablation: median miss by variant. Full-set rows use all 128 comps; the last row is the model as built.' }),
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Variant' }), el('th', { scope: 'col', text: 'Random-split' }), el('th', { scope: 'col', text: 'Time-split' }))),
        el('tbody', null, ab.map(function (r) {
          return el('tr', null, el('td', { text: r[0] }), el('td', { class: 'num', text: r[1] }), el('td', { class: 'num', text: r[2] }));
        }).concat([el('tr', { class: 'built' },
          el('td', null, el('b', { text: 'As built: restricted 94 comps + k=3' })),
          el('td', { class: 'num' }, el('b', { text: 'x3.53' })),
          el('td', { class: 'num' }, el('b', { text: 'x2.08' }))
        )]))
      ),
      el('p', { class: 'sub', text: 'Hit-rate shares (within-3x/10x) are not claimed — the research runs record median miss only. On all 128 comps: x3.71 / x2.91.' })
    );
  }

  function modelPanel() {
    var c = DATA.curve;
    return el('section', { class: 'panel model', id: 'model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'One function of the snapshot figures scores every row; no name is special-cased.' }),
      el('div', { class: 'formula' },
        'implied = round( exp(' + c.intercept.toFixed(3) + ' + ' + c.slope.toFixed(3) + ' x log(TVL) + category_effect) x sibling_factor )'
      ),
      el('p', { class: 'sub', text: 'The curve is a global log-log fit on the ' + c.comp_count + ' comparable tokens that already trade (restricted comps: live-token protocols outside infrastructure/exchange). The category effect is a shrunk intercept shift, k=3: the category\'s residuals over (n + 3). A row whose first word matches a live-token protocol\'s is kin-linked and halved (x0.5, 7 rows).' }),
      el('p', { class: 'sub', text: 'The band is the leave-one-out residual band on those ' + c.comp_count + ' comps: P10 x' + c.loo_p10.toFixed(2) + ' / P25 x' + c.loo_p25.toFixed(2) + ' / P75 x' + c.loo_p75.toFixed(2) + ' / P90 x' + c.loo_p90.toFixed(2) + ', median miss x' + c.loo_median_miss.toFixed(2) + '. The multiple is precisely estimated (±12%) but predicts poorly (x3–4 error) — the band is the residual, not the bootstrap. A point estimate without a band would be the most dishonest thing this radar could show.' }),
      el('p', { class: 'sub', text: 'P(launch) is the empirical age x TVL table: $5M–$50M 0.47 / 0.34 / 0.67, $50M–$200M 0.54 / 0.40 / 0.74, $200M–$1B 0.52 / 0.50 / 0.68, $1B+ 0.79 / 0.47 / 0.62 (age <=1y / 1–2y / >2y). The age pattern is non-monotone — no logistic model is used. Netting is pro-rata 10%: net = P(launch) x (1000/TVL) x 0.10 x implied − $10.93, at the P25 low end, the point, and the P75 high end. ROBUST pays at the low end, FARM at the point, THIN only at the high end, SKIP at none.' }),
      el('p', { class: 'sub', text: 'Tested and dropped: seven-day growth, maturity/seasoning, breadth (chains) — all hurt out-of-sample on the full 128 comps (see the ablation table above). Age still drives P(launch) and the hold (30/45/60 days); growth is shown on every row. Backtests, restricted set: LOO x' + c.loo_median_miss.toFixed(2) + '; random-split x3.53; time-split x2.08; k=3 improves the restricted set by ~1% over global-only.' })
    );
  }

  function footer() {
    return el('section', { class: 'panel foot' },
      el('h2', { text: 'Left out, and why' }),
      el('p', { class: 'sub', text: '144 pre-token rows were excluded by the watchlist\u2019s own rule: category 128 · versioned name 11 · wrapped / staked word 20 · exchange prefix 14 (grounds overlap; e.g. WBTC, Binance staked ETH). They are not rows, and they are not hidden.' }),
      el('p', { class: 'honest', text: 'Implied value is a model, not a price. Nothing here predicts whether or when a protocol issues a token.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function miniTable(head, rowsHtml) {
    return el('table', { class: 'mini' },
      el('thead', null, el('tr', null, head.map(function (h) { return el('th', { scope: 'col', text: h }); }))),
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
    // Factor decomposition: size x category x sibling; the category effect is recovered: implied / (size x sibling).
    var size = Math.exp(c.intercept + c.slope * Math.log(row.tvl_usd));
    var sib = row.sibling ? 0.5 : 1;
    var catMult = row.implied_value_usd / (size * sib);
    // Break-even as a share of the farmer's slice: under 100% the slice pays.
    var breakEvenOfSlice = bePct(row, 1000);
    var peers = DATA.live.slice().sort(function (a, b) {
      return Math.abs(Math.log(a.tvl_usd) - Math.log(row.tvl_usd)) - Math.abs(Math.log(b.tvl_usd) - Math.log(row.tvl_usd));
    }).slice(0, 5);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + (row.sibling ? ' · kin-linked (x0.5)' : '') })
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
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': net = P(launch) x (1000/TVL) x 10% x implied − $10.93. An estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Where the value comes from' }),
      miniTable(['Factor', 'Value'], [
        el('tr', null, el('td', { text: 'Size curve: exp(' + c.intercept.toFixed(3) + ' + ' + c.slope.toFixed(3) + ' x log TVL)' }), el('td', { class: 'num', text: fmtUsd(size) })),
        el('tr', null, el('td', { text: 'Category effect (' + (row.category || 'Other') + ', shrunk k=3)' }), el('td', { class: 'num', text: 'x' + catMult.toFixed(2) })),
        el('tr', null, el('td', { text: 'Sibling factor' + (row.sibling ? ' (kin-linked)' : '') }), el('td', { class: 'num', text: 'x' + sib.toFixed(1) })),
        el('tr', null, el('td', null, el('b', { text: 'Implied value if it launches' })), el('td', { class: 'num' }, el('b', { text: fmtUsd(row.implied_value_usd) })))
      ]),
      el('p', { class: 'sub', text: 'The category effect is recovered from this row (implied / (size x sibling)).' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Nearest trading peers' }),
      miniTable(['Protocol', 'TVL', 'Market cap', 'Mcap / TVL'], peers.map(function (p) {
        return el('tr', null,
          el('td', { text: p.name }),
          el('td', { class: 'num', text: fmtUsd(p.tvl_usd) }),
          el('td', { class: 'num', text: fmtUsd(p.mcap_usd) }),
          el('td', { class: 'num', text: 'x' + (p.mcap_usd / p.tvl_usd).toFixed(2) })
        );
      })),
      el('p', { class: 'sub', text: 'The 5 live-token comps closest in TVL (log terms).' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Both nets: with launch odds, and if it launches' }),
      el('div', { class: 'both' },
        el('div', { class: 'both-cell' }, el('span', { text: 'Net with launch odds' }), el('b', { class: 'num', text: fmtMoney(row.net_point_usd) })),
        el('div', { class: 'both-cell' }, el('span', { text: 'Net if it launches' }), el('b', { class: 'num', text: fmtMoney(netNoP(row, 1000)) }))
      ),
      el('p', { class: 'sub', text: 'Value if it launches is ' + fmtUsd(row.implied_value_usd) + '; the second net is the upside if it really launches. The verdict keeps the launch odds in.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'If the launch is smaller than the point' }),
      miniTable(['Implied value drops', 'Net at $1,000', 'Net at $10,000', 'Net at $100,000'], [0.05, 0.10, 0.20].map(function (d) {
        return el('tr', null,
          el('td', { text: '−' + Math.round(d * 100) + '%' }),
          el('td', { class: 'num ' + (netAt(row, 1000, d) >= 0 ? 'pos' : 'neg'), text: fmtMoney(netAt(row, 1000, d)) }),
          el('td', { class: 'num ' + (netAt(row, 10000, d) >= 0 ? 'pos' : 'neg'), text: fmtMoney(netAt(row, 10000, d)) }),
          el('td', { class: 'num ' + (netAt(row, 100000, d) >= 0 ? 'pos' : 'neg'), text: fmtMoney(netAt(row, 100000, d)) })
        );
      })),
      el('p', { class: 'sub', text: 'Net with launch odds after the implied value falls by that share; cost is gas $6 + T-bill 4% for 45 days.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: '$1,000 plan vs $10,000 plan' }),
      miniTable(['', '$1,000', '$10,000'], [
        el('tr', null, el('td', { text: 'Slice of the launch' }), el('td', { class: 'num', text: fmtUsd(sliceUsd(row, 1000)) }), el('td', { class: 'num', text: fmtUsd(sliceUsd(row, 10000)) })),
        el('tr', null, el('td', { text: 'Cost (gas + T-bill, 45d)' }), el('td', { class: 'num', text: fmtMoney(costFor(1000)) }), el('td', { class: 'num', text: fmtMoney(costFor(10000)) })),
        el('tr', null, el('td', { text: 'Net with launch odds' }), el('td', { class: 'num ' + (row.net_point_usd >= 0 ? 'pos' : 'neg'), text: fmtMoney(row.net_point_usd) }), el('td', { class: 'num ' + (netAt(row, 10000, 0) >= 0 ? 'pos' : 'neg'), text: fmtMoney(netAt(row, 10000, 0)) })),
        el('tr', null, el('td', { text: 'Break-even, share of slice' }), el('td', { class: 'num', text: bePct(row, 1000).toFixed(0) + '%' }), el('td', { class: 'num', text: bePct(row, 10000).toFixed(0) + '%' }))
      ]),
      el('p', { class: 'sub', text: 'Same arithmetic at ten times the deposit. The verdict is the $1,000 plan\u2019s.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('div', { class: 'tl' },
        el('i', null), el('span', { text: 'Day 0 — set up' }), el('b', null),
        el('i', null), el('span', { text: 'Weekly action x' + Math.ceil(hold / 7) }), el('b', null),
        el('i', null), el('span', { text: 'Day ' + hold + ' — claim check' })
      ),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
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
    shell.appendChild(bestStrip());
    shell.appendChild(controls());
    if (state.tab === 'pre-token') {
      shell.appendChild(boardTable());
      shell.appendChild(oosPanel());
      shell.appendChild(modelPanel());
      shell.appendChild(footer());
    } else if (state.tab === 'live') {
      shell.appendChild(liveTable(DATA.live, 'The 94 restricted comps: live-token protocols outside the infrastructure and exchange categories. The curve is fitted on these.', 'already trades'));
    } else {
      shell.appendChild(liveTable(DATA.set_aside, 'The 34 set aside from the comps: Bridge, CEX, Liquid Staking, Canonical Bridge, Liquid Restaking, Restaked BTC. Their multiples do not describe app launches.', 'set aside'));
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
    var ah = window.location.hash;
    if (ah === '#oos') {
      var t = document.getElementById(ah.slice(1));
      if (t) t.scrollIntoView();
    }
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
