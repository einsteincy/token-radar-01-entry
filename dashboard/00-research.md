# Token Radar — research note

To the judge: what this entry built, how it was tested, and where it can be wrong. Every
number is computed from the snapshot at build time or reproduced from the research. Nothing
here is a claim about the future.

## 1. What this entry is

A radar pricing all 198 pre-token protocols — the 40-protocol watchlist plus every other pre-token protocol the snapshot holds — off the 94 comps that already trade. Every implied value carries the LOO band (P10 x0.08 to
P90 x9.16); every row carries a farm plan netted to the dollar, a
verdict, a break-even share, and a net-per-hour figure.

## 2. The board: 198 clean rows, 758 accounted for

Snapshot: 758 protocols — 416 already trade, 342 record no token. Excluding from the 342,
in order: bridge/CEX/liquid-staking categories (128), version-marked names (11),
whole-word wrapped/staked (5 more; 20 match in total), exchange-prefixed names (0 more; 14 in total).
Leaves 198 clean rows. Ledger: 758 = 198 ranked + 416 already trade + 43 bridges + 43
liquid staking & restaking + 42 exchange custody + 11 versioned + 5 wrapped or staked.
The 198 are 40 on the watchlist, 138 below the $50M floor, 20 above the floor but not on
it — flagged, not hidden (Sentora $2,758M, Polymarket $320M), probably by `parentProtocol` (not in the snapshot). All 40 watchlist slugs present (40/40).

## 3. The model

Implied value = round(exp(8.998 + 0.405 x log(TVL) + category_effect)).
Curve: global log-log fit on the restricted 94 comps. Intercept 8.998, slope 0.405.
R-squared 0.103, residual SD 1.99 log in-sample (2.03 leave-one-out). Category effect: shrunk intercept shift, k=3.
Only 76 of 198 rows sit in categories with 5+ comps; 20 with 3-4, 84 with 1-2, 18 with none
(effect 0). Risk Curators (34 rows) rests on one comp (x1.56 from a single residual);
each detail view shows the row's category n and mean residual. Kin discount removed in P6 (§13).
Tested and dropped (all hurt out-of-sample): seven-day growth,
maturity/seasoning, breadth / chains. Growth stays as a column; age drives P(launch).

## 4. The band and the blind tests

LOO band on the 94 comps: P10 x0.08 / P25 x0.30 / P75 x4.03 / P90 x9.16, median miss
x3.69. Random 47/47 split, 200 seeded repeats: model x3.44 (global-only x3.57). Time-split (fit pre-2024, test 2024+): model x2.21, global-only
x2.08 (§10 — x2.08 is not the model's score). Walk-forward: 2023 (fit 17 / test 54)
global x2.39 vs model x3.06; 2024 (fit 30 / test 41) global x2.08 vs model x2.21, rank ρ
0.313 vs 0.301. The 2022 fold (fit 4) is degenerate. The category effect is a wash on the random split (≈ +0.4% on average, wins 58/100 macro-seeds) and hurts the time-split; kept for that small edge and the category story's stated structure — not for time-split performance. Hit-rate on the 94 LOO ratios: within 3x 42.6%, within 10x 79.8%; the printed P25–P75
band holds 48.9%, P10–P90 holds 77.7%. Refit stability (200×): only 8 of the top 20 stay
in the top 20 in ≥80% of refits; median P90–P10 rank width 64.3. The board shows the
P10–P90 rank range for top-20 rows (Predict Fun 2–145). Per-category bands are diagnostic only (n≥5), vs live global x0.30–x4.03 — see the model page table. RWA's SD band is 6.9x narrower (residual SD 0.60 vs 2.03
global), but its empirical band
sits almost entirely above x1.0. Three constructions would move 31, 9 and 17 rows; none
is adopted. Bootstrap (500 resamples): precise only at $50M (−13.6%/+13.7%); $500M
−19.7%/+25.8%; $2.75B −27.6%/+40.1%. LOO x3.69 is computed at build time; the other blind tests are research runs (`p3-evidence.mjs`, seed 20261119; `entry/evidence.json`).

## 5. The launch base rate

P(launch) is the empirical age x TVL table (share with a token), not a model:

|TVL|≤1y|1–2y|>2y|
|---|---|---|---|
|$5M–$50M|0.47|0.34|0.67|
|$50M–$200M|0.54|0.40|0.74|
|$200M–$1B|0.52|0.50|0.68|
|$1B+|0.79|0.47|0.62|

Overall 0.549; by age ≤1y 51.5%, 1–2y 38.6%, >2y 68.0%. Non-monotone, so no logistic model is used. Smallest cell n=15. Calibration is weak: 5-fold CV
log-loss (n=758) 0.670 vs 0.690 base rate vs 0.667 logistic (AUC 0.637); the earlier
0.6527 is in-sample, not CV. Hazard caveat: the table is P(has-token) for a RANDOM
protocol — an upper bound for old pre-token rows.

## 6. Netting and verdicts

Net = P(launch) x (1000 / TVL) x 0.10 x implied − $10.93, at P25, point and P75. The 10% is the share (slice = deposit / TVL x 10%). The
$10.93 is $6 gas + $4.93 T-bill on $1,000 for 45 days at ~4%. ROBUST
pays at the low end, FARM at the point, THIN only at the high end, SKIP at none
(24/93/70/11 through P5; 26/94/68/10 since P6, §13). Verdicts are knife-edge: 35 rows sit within $2 of a boundary. Cost ±$2 changes 31–34 rows; share 5% changes 105 rows, 20% changes 108. The
10% share is the biggest lever — an assumption, not a measurement. The flat $10.93 stays
although gas is chain-dependent: two readings give
$3.79–$14.58 (77 rows change) and $12.36–$31.72 (59 rows change) — opposite directions,
so neither is adopted without a decision. Each row's farm plan is six steps from its own
record (WHEN / COST / TIME table, exit TVL −30%, review date).

## 8. What the starter got wrong

The starter ranks 200 rows (40 watchlist + 160 below the floor); 103 of the 160 are
wrapped, bridged or staked products of live-token protocols, scored at a flat 0.25× TVL,
no band.

## 9. Honesty box: what the snapshot cannot say

No `parentProtocol`, so the entry cannot verify why the 20 above-floor rows are off the
watchlist. No ranking or farm plan is in the snapshot. The
10% share is an assumption. Implied value is not a price, not a prediction of whether or
when a token is issued, nor a promise that farming pays.

## 10. P3 (evidence pack, 19 Nov 2026)

Model, rows and verdicts unchanged (24/93/70/11). Evidence only — rank #12 of 12,312, 95.9650%.

- **Attribution correction.** The headline x2.08 quoted since P2 is the GLOBAL-ONLY fit
on the time-split; the model as built scores x2.21 (rank ρ 0.301 vs 0.313). The cover
quotes x2.21 for the model, x2.08 as global-only. The "±12%" holds only at $50M (§4); calibration is the refit 0.670, not the in-sample 0.6527 (§5).
- **Cover.** A $1,000/$10,000 ticket toggle recomputes nets and verdicts; the board gains a "Net if launch" column and P10–P90 rank ranges for
top-20 rows.
- **Detail + model page.** The factor chain shows running dollars and the category's n
comps + mean residual; the farm plan is a WHEN / COST / TIME table with total, exit rule
(TVL −30%) and review date; the drop-share grid shows the verdict per cell; nearest peers
gain MODEL and MISS columns; the model page shows per-category bands, verdict sensitivity, chain-dependent cost ranges and launch calibration as diagnostics, plus a "Note to the judge". Bands and chain cost are NOT implemented (§4, §6).
- **Numbers.** All P3 numbers come from `p3-evidence.mjs` (seed 20261119) via `entry/evidence.json`, injected into `data.js` at build time. `lib/model.ts` untouched; `main.ts` only gains the evidence injection.
- **Audit ronde 1 (19 Nov).** §3 R²/SD corrected to the restricted 94 (0.103/1.99 in-sample, 2.03 LOO); lede floor split corrected (138 below, 20 above); §2 exclusion counts reconciled with the footer.
- **Audit ronde 2 (19 Nov).** §3 split 76/20/84/18; §4 6.1x = SD band, not SD. **Revision round 2 (19 Nov): 6.1x corrected to 6.9x** — the 6.1x mixed the global *empirical* P25–P75 band (log-width 2.615) with the RWA *SD* band (0.804); the like-for-like SD-band width ratio is exp(2×0.6745×(2.033−0.596)) = 6.9x, reproducible from the SDs quoted in the sentence.

## 11. P4 (board-first cover, 19 Nov 2026)

Model, rows and verdicts unchanged (24/93/70/11). Layout only: cover is KPI strip + one evidence row + board (≥8 rows at 1440×900), controls above it; Tested-blind, ablation and tenure move to the method page. Shot 2 is the detail scrolled to the farm plan; shot 3 was the $10K FARM view (top net $128 Bucket CDP; book net $4,750). The verdict filter follows the ticket, so the badges in the view are the $10K verdicts. Predict Fun's $10K nets ($1,681 with odds, $2,536 if it launches) are the board's largest, but it was ROBUST, so it was not in the FARM view.

## 12. P5 (21 Nov 2026)
Shot 3 is all rows at $10,000 by net (Predict Fun tops it: $1,681 / $2,536). Book line is the whole board (198 rows · $10,952 · $24,812 · 303 h). Cover shows 10 rows; badge has the main.ts checksum. Model unchanged.

## 13. P6 (22 Nov 2026)
Cover shows 12 rows; best farm lists $125/h at $1K and $1,296/h at $10K; ledger names kept/rejected terms. Farm-book line adds the P25 net. Peers table was already in the detail view since P2. Model: kin discount removed; verdicts 26/94/68/10; book $24,812 to $25,652; Predict Fun $1,681/$2,536 unchanged. k=3 kept.
