# Deferred Items — Notes
_Umbrella: [../2026-04-21-team-building-review-design.md](../2026-04-21-team-building-review-design.md)_

Ten items flagged during the 2026-04-21 team-building review but parked rather than scheduled. Each entry: what it is, why we parked it, when to revisit, and rough effort estimate.

To activate any of these, promote to a full spec + prompt pair in this subdirectory (matching the format of items 1.x and 2.x).

---

## 3.1 Calibrate the logistic win-probability curve
- **What:** The `/8` scale factor in `winProbability` (lib/utils.ts) is arbitrary. Whether a 10-point score diff actually corresponds to ~73% win probability is uncalibrated.
- **Parked because:** Fitting the curve requires 50+ matches of post-rebalance data. Pre-rebalance games used different weights and are noise for this fit.
- **Revisit when:** ~3–4 months of post-commit-`825b203` games accumulate. Pull `team_a_rating` / `team_b_rating` / `winner` from the `games` table, fit a logistic, update `WIN_PROB_SCALE`.
- **Effort:** ~1 day.

## 3.2 Per-role WPRs / tactical balance
- **What:** `ewptScore` treats WPR as scalar. Five attackers can score identically to a mix of attackers, defenders, and balanced players at the same average WPR. Only the (crude) variety bonus guards against tactically lopsided teams.
- **Parked because:** Requires either per-role WPRs (larger data model) or structural constraints ("at least 1 defender per team") with UX implications.
- **Revisit when:** Lineups feel tactically lopsided despite similar `ewptScore` values. Anecdotal evidence needed first.
- **Effort:** 3–5 days.

## 3.3 Chemistry / familiarity modelling
- **What:** Two players who've played together 20+ times likely function better than strangers of equal rating. Not modelled.
- **Parked because:** Non-trivial to implement (pairwise history lookup); incremental benefit likely limited on top of existing fairness.
- **Revisit when:** Low priority. Only if a user specifically asks "why didn't this pairing happen?"
- **Effort:** 2–3 days.

## 3.4 Cadence-aware rustiness threshold
- **What:** The 28-day rustiness threshold in `wprScore` is calendar-based. Fine for a weekly league (~4 games' gap); wrong for monthly or twice-weekly cadences.
- **Parked because:** The current league's cadence is stable; no harm today.
- **Revisit when:** A second league is added with different cadence, or this league's cadence changes.
- **Effort:** Half a day — compute average week interval; scale `RUSTINESS_DAYS` relative to it.

## 3.5 Strength-hint granularity
- **What:** Three hints (`below` / `average` / `above`) with ±15 WPR jumps. A single "above" step is a 15-point swing — coarse.
- **Parked because:** UX decision, not scoring-math. Adding a 5-level picker or a continuous slider is a frontend change.
- **Revisit when:** Admins report they can't accurately rate new players with the 3-level system.
- **Effort:** Half a day for 5-level; ~1 day for a slider with labelled anchors.

## 3.6 GK modifier empirical tuning
- **What:** Post-rebalance GK bonus range is +0.5 to +2.5. Whether that matches real keeper impact needs match data.
- **Parked because:** Blocked on 3.1 — needs calibration data.
- **Revisit when:** Bundle with 3.1.
- **Effort:** Small — part of the 3.1 calibration pass.

## 3.7 Top-2 bonus empirical tuning
- **What:** Top-2 weight was halved (25% → 10%) in the April 20 rebalance. Whether 10% is the right level depends on match data.
- **Parked because:** Blocked on 3.1.
- **Revisit when:** Bundle with 3.1.
- **Effort:** Small — part of 3.1.

## 3.8 Rating-aware sampling for n > 20
- **What:** Random-sample fallback at `n > EXHAUSTIVE_THRESHOLD (20)` is rating-oblivious. 500 shuffles may miss the optimum. A snake-draft seeded from sorted WPRs + local swap would be faster and better.
- **Parked because:** 5-a-side and 7-a-side squads cap out around 14 players. The `n > 20` branch rarely or never fires in practice.
- **Revisit when:** If the app ever supports larger formats (11-a-side, league tournaments).
- **Effort:** 2 days.

## 3.9 Remove dead `rating` field on GuestEntry / NewPlayerEntry
- **What:** Both types set `rating: 2` unconditionally since the strength-hint migration. The field is dead data.
- **Parked because:** Removing requires auditing stored `LineupMetadata` JSON on old `games` rows to confirm nothing downstream reads it.
- **Revisit when:** DB audit confirms no reads; at that point drop the field + add a tiny migration if the schema holds it.
- **Effort:** 2–4 hours (audit + removal).

## 3.10 Noise scaling in win probability
- **What:** The logistic win-probability curve is translation-invariant. A 5-point gap at scores 40/45 predicts the same win probability as at 80/85. In reality, weak-vs-weak matches are probably noisier than strong-vs-strong.
- **Parked because:** Requires a score-level-dependent noise term — meaningful modelling work.
- **Revisit when:** After 3.1 — if the calibrated logistic doesn't fit well at the low-score end, noise scaling becomes the likely explanation.
- **Effort:** 3–5 days, depends on 3.1 insights.
