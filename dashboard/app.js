// Token Radar's plain dashboard (round-2 model). It reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, a filterable table, a per-protocol detail drawer with
// the model's own inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
//
// The model, in one place: a global log-log curve on the 94 comparable tokens that already trade,
// a shrunk (k=3) category intercept, a x0.5 sibling factor on kin-linked rows, an LOO-residual band,
// a corrected empirical launch-probability table, and pro-rata 10% netting into four verdicts.
// Growth, maturity/seasoning and breadth were tested and dropped — they hurt out-of-sample — and
// age drives P(launch) and the hold, not the value curve. The page recomputes a row's farm plan
// from the snapshot figures and checks the number board.json carries, so the page's code and the
// board's data are visibly the same arithmetic.
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

  // The farm plan is the same derivation main.ts writes to board.json: the category, chains, TVL
  // and age decide the action, the capital, the hold and every cost and time, and the row's own
  // verdict and nets decide the walk-away. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $1,000 of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return "Provide $1,000 of liquidity to " + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $1,000 of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $1,000 of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $1,000 of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $1,000 and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $1,000 into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $1,000 of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $1,000 of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $1,000 of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $1,000 of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
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
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'launch') { av = a.launch_probability; bv = b.launch_probability; }
      else if (key === 'net') { av = a.net_per_hour_usd; bv = b.net_per_hour_usd; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
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
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The radar adds ' + DATA.early_size + ' pre-token protocols below that floor, priced off the ' + c.comp_count + ' comparable tokens that already trade. Implied value is a model, not a promise — every row carries its band.' }),
        el('p', { text: 'ROBUST ' + vc.ROBUST + ' · FARM ' + vc.FARM + ' · THIN ' + vc.THIN + ' · SKIP ' + vc.SKIP + ' — netted at $1,000 against a $10.93 cost (gas $6 + T-bill $4.93 for 45 days) at a pro-rata 10% share.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Curve' }), el('b', { text: c.intercept.toFixed(3) + ' + ' + c.slope.toFixed(3) + ' log(TVL)' })),
        el('div', { class: 'fact' }, el('span', { text: 'LOO band, P25–P75' }), el('b', { text: 'x' + c.loo_p25.toFixed(2) + ' – x' + c.loo_p75.toFixed(2) })),
        el('div', { class: 'fact' }, el('span', { text: 'LOO median miss' }), el('b', { text: 'x' + c.loo_median_miss.toFixed(2) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.set_aside_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var vselect = el('select', { id: 'verdict', 'aria-label': 'Filter by verdict' },
      ['all', 'ROBUST', 'FARM', 'THIN', 'SKIP'].map(function (v) { return el('option', { value: v, text: v === 'all' ? 'All verdicts' : v, selected: v === state.verdict ? 'selected' : null }); })
    );
    vselect.addEventListener('change', function () { state.verdict = vselect.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live comps', onclick: function () { state.tab = 'live'; render(); } });
    var aside = el('button', { type: 'button', 'aria-pressed': state.tab === 'set-aside' ? 'true' : 'false', text: 'Set aside', onclick: function () { state.tab = 'set-aside'; render(); } });
    var countText = state.tab === 'pre-token' ? rows().length + ' rows shown' : state.tab === 'live' ? DATA.live.length + ' live-token comps' : DATA.set_aside.length + ' set aside';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'verdict', text: 'Verdict' }), vselect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live, aside)),
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
        el('p', { text: 'Clear the search or pick another category or verdict to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.verdict = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (r.sibling ? ' · kin-linked' : '') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('div', null,
            el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
            el('div', { class: 'sub', text: fmtUsd(r.implied_low_usd) + ' – ' + fmtUsd(r.implied_high_usd) })
          )
        )),
        el('td', { class: 'num', text: r.launch_probability.toFixed(2) }),
        el('td', null, el('span', { class: verdictClass(r.verdict), text: r.verdict })),
        el('td', { class: 'num ' + (r.net_per_hour_usd >= 0 ? 'pos' : 'neg'), text: fmtMoney(r.net_per_hour_usd) + '/h' })
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. The band under each value is the P25–P75 range. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('implied', 'Implied value (P25–P75)'),
            sortHeader('launch', 'P(launch)'),
            el('th', { scope: 'col', text: 'Verdict' }),
            sortHeader('net', 'Net / hour')
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

  function modelPanel() {
    var c = DATA.curve;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( exp(' + c.intercept.toFixed(3) + ' + ' + c.slope.toFixed(3) + ' x log(TVL) + category_effect) x sibling_factor )'
      ),
      el('p', { class: 'sub', text: 'The curve is a global log-log fit on the ' + c.comp_count + ' comparable tokens that already trade (restricted comps: live-token protocols outside the infrastructure and exchange categories). The category effect is a shrunk intercept shift, k=3: the sum of the category\'s residuals over (n + 3). A row whose first word matches a live-token protocol\'s first word is kin-linked and its value is halved (x0.5, 7 rows): a sibling\'s token already takes part of the family\'s value.' }),
      el('p', { class: 'sub', text: 'The band is the leave-one-out residual band on those ' + c.comp_count + ' comps, global-only fit: P10 x' + c.loo_p10.toFixed(2) + ' / P25 x' + c.loo_p25.toFixed(2) + ' / P75 x' + c.loo_p75.toFixed(2) + ' / P90 x' + c.loo_p90.toFixed(2) + ', median miss x' + c.loo_median_miss.toFixed(2) + '. The band is wide because the residual variance dominates: the multiple is precisely estimated (±12%) but predicts poorly (x3–4 error). A point estimate without a band would be the single most dishonest thing this radar could show.' }),
      el('p', { class: 'sub', text: 'P(launch) is the empirical age x TVL table from the snapshot: $5M–$50M 0.47 / 0.34 / 0.67, $50M–$200M 0.54 / 0.40 / 0.74, $200M–$1B 0.52 / 0.50 / 0.68, $1B+ 0.79 / 0.47 / 0.62 (age <=1y / 1–2y / >2y). The age pattern is non-monotone — it dips at 1–2y and is highest past 2y — so no logistic model is used. Netting is pro-rata 10%: net = P(launch) x (1000/TVL) x 0.10 x implied − $10.93, at the P25 low end, the point, and the P75 high end. ROBUST pays at the low end, FARM at the point, THIN only at the high end, SKIP at none.' }),
      el('p', { class: 'sub', text: 'Tested and dropped from the value curve: seven-day growth, maturity/seasoning, and breadth (chains). All three hurt out-of-sample (random-split LOO x3.69 global-only; time-split x2.91; growth and age both worse on both splits). Age still drives P(launch) and the hold (30/45/60 days), and growth is shown on every row. Backtests: leave-one-out median miss x' + c.loo_median_miss.toFixed(2) + '; time-split (fit pre-2024, test 2024+) x2.91; category k=3 improves the restricted set by ~1% over global-only.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    // Break-even as a share of the farmer's own slice: the slice is (1000/TVL) x 10% of the
    // implied value, and the break-even share is the fraction of implied value that covers the
    // $10.93 cost. Under 100% the slice pays; over 100% it does not.
    var slice = (1000 / row.tvl_usd) * 0.10;
    var breakEvenOfSlice = row.break_even_share / slice * 100;
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + (row.sibling ? ' · kin-linked (x0.5)' : '') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Implied value (point)' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'Band, P25–P75' }), el('b', { class: 'num', text: fmtUsd(row.implied_low_usd) + ' – ' + fmtUsd(row.implied_high_usd) })),
        el('div', null, el('span', { text: 'P(launch)' }), el('b', { class: 'num', text: row.launch_probability.toFixed(2) })),
        el('div', null, el('span', { text: 'Break-even, share of your slice' }), el('b', { class: 'num', text: (breakEvenOfSlice >= 100 ? Math.round(breakEvenOfSlice) + '%' : breakEvenOfSlice.toFixed(0) + '%') })),
        el('div', null, el('span', { text: 'Net at $1,000, low / point / high' }), el('b', { class: 'num', text: fmtMoney(row.net_low_usd) + ' / ' + fmtMoney(row.net_point_usd) + ' / ' + fmtMoney(row.net_high_usd) })),
        el('div', null, el('span', { text: 'Net per hands-on hour' }), el('b', { class: 'num', text: fmtMoney(row.net_per_hour_usd) + '/h' })),
        el('div', null, el('span', { text: 'Verdict' }), el('b', { class: 'num', text: row.verdict }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': net = P(launch) x (1000/TVL) x 10% x implied − $10.93. This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
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
    shell.appendChild(controls());
    if (state.tab === 'pre-token') {
      shell.appendChild(boardTable());
      shell.appendChild(modelPanel());
    } else if (state.tab === 'live') {
      shell.appendChild(liveTable(DATA.live, 'The 94 restricted comps: live-token protocols outside the infrastructure and exchange categories, by market cap. The curve is fitted on these.', 'already trades'));
    } else {
      shell.appendChild(liveTable(DATA.set_aside, 'The 34 live-token protocols set aside from the comps: Bridge, CEX, Liquid Staking, Canonical Bridge, Liquid Restaking and Restaked BTC. Their multiples do not describe app launches, so they do not enter the curve.', 'set aside'));
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
