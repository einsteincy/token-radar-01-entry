// The token radar's model (round-2 design, build 2026-11-15): one snapshot in, one ranked board out.
//
// The board covers every genuinely pre-token protocol the snapshot holds (the clean 198), priced
// off the 94 comparable tokens that already trade. Every number is derived from the snapshot:
//
//   curve      = global log-log on the restricted 94 comps: log(mcap) = a + b*log(TVL)
//                (fitted at build time; research: a = 8.998, b = 0.405, i.e. 10^3.91 x TVL^0.405)
//   category   = shrunk intercept shift, k=3: sum(residuals in category) / (n_cat + 3)
//                (applied to ALL categories; the k=3 shrinkage pulls small-n toward 0)
//   sibling    = NO discount since P6 (22 Nov 2026): kin-linked rows were halved (x0.5,
//                7 rows) through P5; the discount is removed — whole-board book $24,812 to
//                $25,652, verdicts 24/93/70/11 to 26/94/68/10, top figures unchanged.
//   implied    = round(exp(a + b*log(TVL) + category_effect) * sibling_factor), min 1
//   band       = LOO residuals on the restricted set, global-only fit, rounded to two decimals
//                (research: P10 x0.08 / P25 x0.30 / P75 x4.03 / P90 x9.16, median miss x3.69)
//   P(launch)  = empirical age x TVL table (corrected round 2; round-1 §6.5 does not reproduce)
//   net        = P(launch) x (1000/TVL) x 0.10 x implied - $10.93, at P25 / point / P75
//   verdict    = ROBUST (low end pays) / FARM (point pays) / THIN (high end pays) / SKIP
//
// Growth, maturity/seasoning and breadth are DROPPED from the value model (all hurt OOS; see the
// research note). No protocol name is ever special-cased: the same function scores every row.
// The 7 kin-linked rows are still derived by the first-word rule at build time, not hardcoded;
// since P6 they carry no discount (SIBLING_FACTOR = 1).

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted curve + band, as the dashboard states them. */
export interface CurveFit {
  intercept: number;
  slope: number;
  comp_count: number;
  loo_p10: number;
  loo_p25: number;
  loo_p75: number;
  loo_p90: number;
  loo_median_miss: number;
}

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** The netting constants (stated in the dashboard and the research note). */
export const PLAN_CAPITAL_USD = 1000;
export const PLAN_COST_USD = 10.93; // gas $6 + T-bill $4.93 on $1k for 45d
export const AIRDROP_POOL_FRACTION = 0.10; // pro-rata 10% share model
export const CATEGORY_SHRINK_K = 3;
export const SIBLING_FACTOR = 1; // P6: kin discount removed (was 0.5 through P5)

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export type Verdict = 'ROBUST' | 'FARM' | 'THIN' | 'SKIP';

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  implied_p10_usd: number;
  implied_p90_usd: number;
  launch_probability: number;
  verdict: Verdict;
  sibling: boolean;
  break_even_share: number;
  net_per_hour_usd: number;
  net_low_usd: number;
  net_point_usd: number;
  net_high_usd: number;
  model: {
    curve_intercept: number;
    curve_slope: number;
    category_effect: number;
    sibling_factor: number;
    age_days: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  launch_probability: number;
  verdict: Verdict;
  sibling: boolean;
  break_even_share: number;
  net_per_hour_usd: number;
  net_low_usd: number;
  net_point_usd: number;
  net_high_usd: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  curve: CurveFit;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  set_aside_size: number;
  verdict_counts: Record<Verdict, number>;
  rows: RadarRow[];
  live: LiveRow[];
  set_aside: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The first word of a name, lowercased, for the sibling rule. */
export function firstWord(name: string): string {
  return (name || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0] || '';
}

/** A whole day count from `from` to `to`; null listed_at means 365 (the null->365 convention). */
export function ageDays(asOf: string, listedAt: string | null): number {
  if (listedAt === null) return 365;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 365;
  return Math.max(1, Math.round((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol has a live token (a market cap, a CoinGecko id, or a symbol). */
export function hasToken(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist rule excludes: infrastructure / exchange products, not app launches. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'CEX', 'Liquid Staking', 'Canonical Bridge', 'Liquid Restaking', 'Restaked BTC']);

/** Exchange names a protocol name must not begin with. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** A whole word wrapped / staked / staking in a name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Why a pre-token protocol is excluded from the clean board, or null when it is clean. */
export function exclusionReason(p: SnapshotProtocol): 'cat' | 'ver' | 'word' | 'exch' | null {
  if (EXCLUDED_CATEGORIES.has(p.category ?? '')) return 'cat';
  if (VERSIONED.test(p.name)) return 'ver';
  if (WRAPPED_WORD.test(p.name)) return 'word';
  const first = p.name.split(/\s+/)[0] || '';
  if (EXCHANGES.includes(first)) return 'exch';
  return null;
}

/** Whether a pre-token protocol is one the board may rank: clean by the watchlist's own rule. */
export function isClean(p: SnapshotProtocol): boolean {
  return isPreToken(p) && exclusionReason(p) === null;
}

/** Whether a protocol is a comparable live-token comp for the curve. */
export function isComp(p: SnapshotProtocol): boolean {
  return (p.mcap_usd ?? 0) > 0 && p.tvl_usd > 0 && !EXCLUDED_CATEGORIES.has(p.category ?? '');
}

/** OLS by normal equations + Gaussian elimination with partial pivoting. */
function ols(X: number[][], y: number[]): number[] {
  const n = X.length;
  const m = X[0]!.length;
  const A: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const b: number[] = new Array<number>(m).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < m; a++) {
      b[a]! += X[i]![a]! * y[i]!;
      for (let c = 0; c < m; c++) A[a]![c]! += X[i]![a]! * X[i]![c]!;
    }
  }
  for (let a = 0; a < m; a++) A[a]![a]! += 1e-9;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0, row = 0; col < m && row < m; col++, row++) {
    let piv = row;
    for (let r = row + 1; r < m; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    [M[row], M[piv]] = [M[piv]!, M[row]!];
    if (Math.abs(M[row]![col]!) < 1e-12) continue;
    for (let r = 0; r < m; r++) {
      if (r === row) continue;
      const f = M[r]![col]! / M[row]![col]!;
      for (let c = col; c <= m; c++) M[r]![c]! -= f * M[row]![c]!;
    }
  }
  const beta: number[] = new Array<number>(m).fill(0);
  for (let i = 0; i < m; i++) beta[i] = M[i]![m]! / (M[i]![i]! || 1);
  return beta;
}

/** Shrunk per-category intercept shifts from training residuals (k=3, all categories). */
function categoryEffects(train: SnapshotProtocol[], residuals: number[], k: number): Record<string, number> {
  const by: Record<string, number[]> = {};
  train.forEach((p, i) => {
    const key = p.category ?? '';
    (by[key] ??= []).push(residuals[i]!);
  });
  const eff: Record<string, number> = {};
  for (const [cat, rs] of Object.entries(by)) {
    eff[cat] = rs.reduce((a, v) => a + v, 0) / (rs.length + k);
  }
  return eff;
}

/** The LOO band factors on the restricted comps (global-only fit): P10/P25/P75/P90 of actual/predicted.
 * The factors are rounded to two decimals — the stated band (x0.08 / x0.30 / x4.03 / x9.16) — and
 * the verdicts are netted from those stated factors, so the band the dashboard shows is the band
 * the verdicts are computed from. (The exact P25 is 0.2952; the stated 0.30 is what the decided
 * verdict counts 26/94/68/10 are computed from.) */
function looBand(comps: SnapshotProtocol[]): { p10: number; p25: number; p75: number; p90: number; medianMiss: number } {
  const ratios: number[] = [];
  const absErrs: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const train = comps.filter((_, j) => j !== i);
    const Xt = train.map((p) => [1, Math.log(p.tvl_usd)]);
    const yt = train.map((p) => Math.log(p.mcap_usd!));
    const b = ols(Xt, yt);
    const test = comps[i]!;
    const pred = b[0]! + b[1]! * Math.log(test.tvl_usd);
    ratios.push(test.mcap_usd! / Math.exp(pred));
    absErrs.push(Math.abs(Math.log(test.mcap_usd!) - pred));
  }
  const pct = (arr: number[], q: number): number => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
  };
  const medAbs = [...absErrs].sort((a, b) => a - b)[Math.floor(absErrs.length / 2)]!;
  const round2 = (x: number): number => Math.round(x * 100) / 100;
  return { p10: round2(pct(ratios, 0.1)), p25: round2(pct(ratios, 0.25)), p75: round2(pct(ratios, 0.75)), p90: round2(pct(ratios, 0.9)), medianMiss: round2(Math.exp(medAbs)) };
}

/** The corrected empirical launch-probability table (round 2, RESEARCH.md §13.3). */
const LAUNCH_TABLE: number[][] = [
  [0.47, 0.34, 0.67], // $5M-$50M:  age <=1y / 1-2y / >2y
  [0.54, 0.4, 0.74], // $50M-$200M
  [0.52, 0.5, 0.68], // $200M-$1B
  [0.79, 0.47, 0.62], // $1B+
];

/** P(launch) from the empirical age x TVL table. */
export function launchProbability(p: SnapshotProtocol, asOf: string): number {
  const tvlBand = p.tvl_usd < 5e7 ? 0 : p.tvl_usd < 2e8 ? 1 : p.tvl_usd < 1e9 ? 2 : 3;
  const age = ageDays(asOf, p.listed_at);
  const ageBand = age <= 365 ? 0 : age <= 730 ? 1 : 2;
  return LAUNCH_TABLE[tvlBand]![ageBand]!;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number): number {
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The category's one action, in the words a farmer can follow ($1,000 plan). */
function actionFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $1,000 of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $1,000 of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $1,000 of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $1,000 of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $1,000 of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $1,000 and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $1,000 into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $1,000 of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $1,000 of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $1,000 of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $1,000 of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

export interface ScoredRow {
  p: SnapshotProtocol;
  age: number;
  implied: number;
  impliedLow: number;
  impliedHigh: number;
  impliedP10: number;
  impliedP90: number;
  launchP: number;
  verdict: Verdict;
  sibling: boolean;
  breakEvenShare: number;
  netLow: number;
  netPoint: number;
  netHigh: number;
  netPerHour: number;
  categoryEffect: number;
  siblingFactor: number;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age) and its computed verdict and nets —
 * never from a hand-written list of names. Step 6 is the walk-away / case-against, from the row's
 * own numbers.
 */
export function farmSteps(s: ScoredRow): FarmStep[] {
  const p = s.p;
  const chain = chainOf(p);
  const hold = holdDaysFor(s.age);
  const action = actionFor(p, chain);
  const walkAway =
    s.verdict === 'SKIP'
      ? `Walk away: the low end nets -$${Math.abs(s.netLow).toFixed(0)} and even the high end nets -$${Math.abs(s.netHigh).toFixed(0)} at $1,000, so this launch does not pay. The case against: P(launch) is ${s.launchP.toFixed(2)} and the implied value is $${s.implied.toLocaleString('en-US')}.`
      : s.verdict === 'THIN'
        ? `Walk away if the gas on the first step exceeds $8, or if the hold stretches past ${hold} days: this plan only pays if the launch beats the point estimate (low end nets -$${Math.abs(s.netLow).toFixed(0)}). The case against: P(launch) is ${s.launchP.toFixed(2)}, below the base rate for its band.`
        : `Walk away if the gas on the first step exceeds $8, or if the position must be unwound before ${hold} days: the plan pays at the point estimate (net $${s.netPoint.toFixed(0)}) but the margin is the band, not a promise.`;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$1,000 of capital and about $3 of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $1,000 stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `${walkAway} Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** Hands-on hours for a plan: the active minutes of the six steps (the hold itself is passive). */
function handsOnHours(holdDays: number): number {
  const weeklyMinutes = 10 * (holdDays / 7);
  return (5 + 15 + weeklyMinutes + 0 + 10 + 5) / 60;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): { board: BoardRow[]; curve: CurveFit; counts: Record<Verdict, number> } {
  const index = bySlug(snapshot.protocols);
  // The clean board: every pre-token protocol the watchlist's own exclusion rule leaves in.
  const clean = snapshot.protocols.filter(isClean);
  // The restricted comps: live-token protocols outside the infrastructure / exchange categories.
  const restricted = snapshot.protocols.filter(isComp);
  // The curve: global log-log on the restricted comps, fitted at build time.
  const X = restricted.map((p) => [1, Math.log(p.tvl_usd)]);
  const y = restricted.map((p) => Math.log(p.mcap_usd!));
  const beta = ols(X, y);
  const residuals = restricted.map((p, i) => y[i]! - (beta[0]! + beta[1]! * X[i]![1]!));
  const effects = categoryEffects(restricted, residuals, CATEGORY_SHRINK_K);
  // The band: LOO residuals on the restricted set, global-only fit.
  const band = looBand(restricted);
  const curve: CurveFit = {
    intercept: beta[0]!,
    slope: beta[1]!,
    comp_count: restricted.length,
    loo_p10: band.p10,
    loo_p25: band.p25,
    loo_p75: band.p75,
    loo_p90: band.p90,
    loo_median_miss: band.medianMiss,
  };
  // Sibling: a clean row whose first word matches a live-token protocol's first word.
  const liveFirst = new Set(snapshot.protocols.filter(hasToken).map((p) => firstWord(p.name)));
  const scored: ScoredRow[] = clean.map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const catEffect = effects[p.category ?? ''] ?? 0;
    const sibling = liveFirst.has(firstWord(p.name));
    const siblingFactor = sibling ? SIBLING_FACTOR : 1;
    const implied = Math.max(1, Math.round(Math.exp(beta[0]! + beta[1]! * Math.log(p.tvl_usd) + catEffect) * siblingFactor));
    const impliedLow = Math.max(1, Math.round(implied * band.p25));
    const impliedHigh = Math.max(1, Math.round(implied * band.p75));
    const impliedP10 = Math.max(1, Math.round(implied * band.p10));
    const impliedP90 = Math.max(1, Math.round(implied * band.p90));
    const launchP = launchProbability(p, snapshot.as_of);
    const slice = (PLAN_CAPITAL_USD / p.tvl_usd) * AIRDROP_POOL_FRACTION;
    const netLow = launchP * slice * impliedLow - PLAN_COST_USD;
    const netPoint = launchP * slice * implied - PLAN_COST_USD;
    const netHigh = launchP * slice * impliedHigh - PLAN_COST_USD;
    const verdict: Verdict = netLow > 0 ? 'ROBUST' : netPoint > 0 ? 'FARM' : netHigh > 0 ? 'THIN' : 'SKIP';
    const breakEvenShare = PLAN_COST_USD / (launchP * implied);
    const netPerHour = netPoint / handsOnHours(holdDaysFor(age));
    return {
      p,
      age,
      implied,
      impliedLow,
      impliedHigh,
      impliedP10,
      impliedP90,
      launchP,
      verdict,
      sibling,
      breakEvenShare,
      netLow,
      netPoint,
      netHigh,
      netPerHour,
      categoryEffect: catEffect,
      siblingFactor,
    };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const counts: Record<Verdict, number> = { ROBUST: 0, FARM: 0, THIN: 0, SKIP: 0 };
  for (const s of scored) counts[s.verdict]++;
  const board: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    implied_low_usd: s.impliedLow,
    implied_high_usd: s.impliedHigh,
    implied_p10_usd: s.impliedP10,
    implied_p90_usd: s.impliedP90,
    launch_probability: s.launchP,
    verdict: s.verdict,
    sibling: s.sibling,
    break_even_share: s.breakEvenShare,
    net_per_hour_usd: s.netPerHour,
    net_low_usd: s.netLow,
    net_point_usd: s.netPoint,
    net_high_usd: s.netHigh,
    model: {
      curve_intercept: beta[0]!,
      curve_slope: beta[1]!,
      category_effect: s.categoryEffect,
      sibling_factor: s.siblingFactor,
      age_days: s.age,
    },
    farm_steps: farmSteps(s).map(stepText),
  }));
  // The watchlist is the floor: every slug must be on the board (it is, by the clean rule).
  void index;
  return { board, curve, counts };
}

/** The live-token protocols for the dashboard's comps view: the restricted 94, by market cap. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter(isComp)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The live-token protocols set aside from the comps: the 34 infrastructure / exchange ones. */
export function setAsideRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => (p.mcap_usd ?? 0) > 0 && p.tvl_usd > 0 && EXCLUDED_CATEGORIES.has(p.category ?? ''))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    launch_probability: row.launch_probability,
    verdict: row.verdict,
    sibling: row.sibling,
    break_even_share: row.break_even_share,
    net_per_hour_usd: row.net_per_hour_usd,
    net_low_usd: row.net_low_usd,
    net_point_usd: row.net_point_usd,
    net_high_usd: row.net_high_usd,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const { board, curve, counts } = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const setAside = setAsideRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    curve,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    set_aside_size: setAside.length,
    verdict_counts: counts,
    rows: board.map(radarRow),
    live,
    set_aside: setAside,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
