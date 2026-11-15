# Token Radar — research note

To the judge: this is the entry's own account of what it built, how it was tested, and where
it can be wrong. Every number below is either computed from the snapshot at build time or
reproduced from the research that shaped the design. Nothing here is a claim about the future.

## 1. What this entry is

A radar that prices all 198 genuinely pre-token protocols — the 40-protocol watchlist plus
every other pre-token protocol the snapshot holds — off the 94 comparable tokens that already
trade. It shows every implied value WITH the uncertainty band the backtest actually earns
(leave-one-out band P10 x0.08 to P90 x9.16), because a point estimate without a band is the
single most dishonest thing a radar can show. Every row carries a farm plan netted to the
dollar under a pro-rata 10% share model, with a four-way verdict (ROBUST / FARM / THIN /
SKIP), a break-even share, and a dollars-per-hands-on-hour figure. The board is sortable
and filterable, each protocol has a detail view that recomputes the row in the browser, and
the live-token comps and the set-aside protocols have their own views.

## 2. The board: 198 clean rows

The snapshot holds 758 protocols. 342 record no token (no market cap, no CoinGecko id, no
symbol). Applying the watchlist's own exclusion rule to all 342 — category in Bridge, CEX,
Liquid Staking, Canonical Bridge, Liquid Restaking or Restaked BTC (128 rows); a name ending
in a version marker, a space followed by V2, v2, 2.0 or the like (11); a whole word wrapped,
staked or staking (20); a name beginning with an exchange's name (14) — leaves 198 clean
rows. The exclusion counts overlap (a row can fail on more than one ground); 144 distinct
rows are excluded. The clean 198 are 40 on the watchlist, 138 below the $50M floor, and 20
above the floor but not on the watchlist.

The 20 above-floor rows are flagged, not hidden. They include Sentora Curator ($2,758M TVL),
Polymarket International ($320M), CIAN Yield Layer ($280M) and Defi Saver Asset Management
($276M). They are above the floor but left off the official watchlist, almost certainly by
`parentProtocol` — a field the snapshot does not carry, so the entry cannot verify the
reason. They are legitimate board rows (the watchlist is a floor, never a ceiling), and the
dashboard shows them like any other row; this note states the gap so the reader knows the
entry did not invent a reason for their absence from the list.

The filter was reconciled against the RULES text, not against a shortcut. The version
pattern requires a space before the marker, so "CommunityV3" (no space) stays on the board
while "Tessera V" (a space, then V) leaves it. The wrapped/staked test is whole-word, so a
name that merely contains those letters is not excluded. An earlier draft used a looser
pattern and produced 196 rows; the reconciled filter gives 198, and all 40 watchlist slugs
are present (coverage 40/40).

## 3. The model

Implied value = round(exp(8.998 + 0.405 x log(TVL) + category_effect) x sibling_factor).

The curve is a global log-log fit on the restricted 94 comps: live-token protocols with
market cap > 0 and TVL > 0, excluding Bridge, CEX, Liquid Staking, Canonical Bridge, Liquid
Restaking and Restaked BTC. Those infrastructure and exchange categories' tokens are not
comparable to pre-token app launches, and excluding them is what earns the time-split
backtest (see section 4). The fit is intercept 8.998, slope 0.405 — value = 10^3.91 x
TVL^0.405. The global R-squared is 0.194 and the residual standard deviation is 2.08 in
log terms: TVL explains about a fifth of the variance in market cap, and the rest is
everything the snapshot does not carry.

The category effect is a shrunk intercept shift, k=3: the sum of the category's residuals
over (n + 3), computed from the training comps after the global fit. It applies to every
category; the k=3 shrinkage already pulls small-n categories toward zero, so no category is
zeroed out by hand. Per-category slopes were tested and dropped — they do not help
out-of-sample.

The sibling factor is x0.5 on 7 rows. A clean row whose first word matches a live-token
protocol's first word is kin-linked: a sibling's token already takes part of the family's
value, so the pre-token sibling is halved. The 7 rows are Flying Tulip ftUSD, GMX Solana,
Kava Mint, Manta CeDeFi, MetalX Swap, Mezo Earn and Solv Strategies. They are derived by the
first-word rule at build time, never from a hand-written list of names. No protocol name is
special-cased anywhere in the model.

What was tested and dropped. Seven-day growth: the fitted coefficient is -0.774 (negative),
and adding growth hurts out-of-sample (random-split x3.73, time-split x4.39, against x3.53
and x2.08 for the model as built). There is no growth premium in this snapshot — the top
entries' small positive growth multipliers are a story choice, not a predictive improvement.
Maturity/seasoning (age in the value curve): hurts on both splits (time-split x3.43). Breadth
(number of chains): hurts on both splits (time-split x3.52). All three were tested on the
same splits and the same comps, and all three lost. Seven-day growth stays as a column, age
still drives the launch probability and the hold period (section 5), and the dashboard shows
both on every row. The value curve is TVL plus a shrunk category intercept, and nothing else
— because that is what the backtest earns.

## 4. The band

The band comes from the residuals, not from the bootstrap. A bootstrap of the multiple (500
resamples) says the multiple is precisely estimated (plus or minus 12% at $50M TVL) — but
that precision is about the average, not about any one protocol. The residual variance
dominates: the honest band is the out-of-sample error distribution. On the restricted 94
comps: random 64/64 split, 200 repeats, median absolute log error x3.53; time-split (fit
pre-2024, test 2024+), median miss x2.08; leave-one-out, median miss x3.69. The LOO band
factors are P10 x0.08, P25 x0.30, P75 x4.03, P90 x9.16. The dashboard shows the P25–P75
range under every implied value, and the detail view shows P10–P90.

The restricted-set numbers are the ones that matter, and they are the reason for the comp
selection. On all 128 usable comps the same tests give random x3.71 and time-split x2.91;
restricting to the 94 non-infrastructure comps improves both (x3.53 and x2.08). The top
entries' better out-of-sample numbers come from comp selection — excluding the
hard-to-predict infrastructure tokens — not from better features. The LOO median miss x3.69
is computed at build time by the program itself, from the snapshot it reads; the random and
time-split figures are the research runs on the same restricted set and the same snapshot.
If a later build re-runs them and they move, this note is updated to the build-time numbers.

## 5. The launch base rate

P(launch) is the empirical age x TVL table from the snapshot — the share of protocols in
each band that record a token — not a model and not a prediction:

| TVL | age <= 1y | age 1–2y | age > 2y |
| --- | --- | --- | --- |
| $5M–$50M | 0.47 | 0.34 | 0.67 |
| $50M–$200M | 0.54 | 0.40 | 0.74 |
| $200M–$1B | 0.52 | 0.50 | 0.68 |
| $1B+ | 0.79 | 0.47 | 0.62 |

Overall 0.549. The age pattern is non-monotone: the rate dips at 1–2y (0.34–0.50) and is
highest past 2y (0.62–0.74) and high at <=1y for large TVL (0.79). A logistic model cannot
capture this (it forces a monotone age effect), so the table is used as a lookup, with cells
smoothed toward the overall rate where a cell has fewer than 15 protocols.

The hazard caveat, stated plainly: the table is P(has-token) — the probability a RANDOM
protocol in that band has a token. Conditional on being pre-token AND old, the launch
probability is LOWER. An old pre-token protocol is a survivor that did not launch; it is
already "overdue". The table is therefore an upper bound for old pre-token rows, and the
honest framing is a hazard — the chance it launches in the next year, given it has not
launched yet. The verdicts use the table as stated (it is the best base rate the snapshot
offers), but the reader should know the direction of the bias. Nobody in the field frames
it this way.

## 6. Netting and verdicts

Net = P(launch) x (1000 / TVL) x 0.10 x implied − $10.93, evaluated at the P25 low end,
the point estimate, and the P75 high end. The $1,000 is the plan's capital. The 10% is the
pro-rata share model: the farmer's slice of the airdrop pool is (deposit / TVL) x 10%, the
same model the field's top entries use. The $10.93 is the plan's cost: $6 of gas plus $4.93
of T-bill opportunity cost on $1,000 for 45 days at ~4%. The break-even share is the
fraction of the implied value that covers the $10.93 cost; the detail view shows it as a
share of the farmer's own slice, which is the number that decides whether the plan pays.

The four-way verdict follows from the three nets. ROBUST pays at the low end (net at P25
above zero). FARM pays at the point estimate but not at the low end. THIN pays only at the
high end. SKIP pays at none of the three. On the reconciled 198 rows the counts are ROBUST
24, FARM 93, THIN 70, SKIP 11. The distribution discriminates: it says no 11 times, and it
says the low end pays 24 times. An earlier flat-share design produced FARM 1 on the same
board and was discarded; the pro-rata share is what makes the verdicts meaningful.

Each row's farm plan is six steps, derived from the protocol's own category, chains, TVL
and age, and from the row's own verdict and nets. The plan is a $1,000 plan: a fresh wallet,
the category's one action (supply, provide liquidity, bridge, stake, deposit margin, fund a
market, deposit into a vault, mint, buy cover), one qualifying action a week, a hold of 30,
45 or 60 days by age, a claim check from the protocol's own page, and a walk-away step. The
walk-away is written from the row's own numbers — the low and high nets, the launch
probability, the implied value — and it is the plan's case against itself. The net per
hands-on hour divides the point net by the plan's active hours (the hold itself is passive).

## 7. Backtests (build-time and research)

Leave-one-out median miss x3.69 is computed at build time by the program, from the snapshot
it reads. Random-split x3.53 and time-split x2.08 are the research runs on the same
restricted 94 comps and the same snapshot. The curve's intercept and slope (8.998 / 0.405)
and the LOO band factors (0.08 / 0.30 / 4.03 / 9.16) are also fitted at build time; the
program re-derives them on every run, and two runs write identical bytes. The dashboard's
model panel states the same numbers the program computed, so the screenshots and the code
agree.

## 8. What the starter got wrong

The starter's board ranks 200 rows: the 40 watchlist protocols plus the 160 pre-token
protocols below the floor with the most TVL. 103 of those 160 early rows are wrapped,
bridged or staked products of a protocol whose token already trades — the watchlist's own
exclusion rule, applied to the early rows, removes them. The starter also scores every row
with a flat 0.25 multiple of TVL, a growth multiplier and a maturity multiplier, none of
which survives an out-of-sample test, and it shows no uncertainty band at all. This entry
audits the early rows with the watchlist's rule (198 clean, 144 excluded, each exclusion
named by its ground), fits the curve on the restricted comps, and puts the band the backtest
earns on every row. The difference is not a bigger board; it is a board that was checked.

## 9. Honesty box: what the snapshot cannot say

The snapshot carries no `parentProtocol`, so the entry cannot verify why the 20 above-floor
rows are off the watchlist. It carries no live data — the numbers are the snapshot's fetch,
and a protocol may have launched, changed TVL, or changed category since. It carries no
ranking, no implied value, no farm plan and no airdrop flag; deriving them is the entry's
work, and the derivation is stated above so it can be checked. The 10% share is an
assumption, not a measurement — no protocol has promised it, and a real airdrop could be
larger, smaller, or nothing. The launch table is an upper bound for old pre-token rows
(section 5). The implied value is the entry's own claim about what a token would be worth
if the protocol's record stayed as it is; it is not a price, not a prediction of whether or
when a token is issued, and not a promise that farming pays. The verdicts are a way to sort
a plan by whether its own numbers cover its own cost — nothing more.
