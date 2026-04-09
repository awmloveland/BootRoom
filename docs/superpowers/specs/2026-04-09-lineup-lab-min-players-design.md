# Lineup Lab — Minimum Players Before Score Reveal

**Date:** 2026-04-09
**Status:** Approved

---

## Problem

The Lineup Lab currently shows team scores (`ewptScore`) as soon as even one player is added to a team. This allows users to put a single player on each side and directly compare individual ratings — which is not the intended use and can cause friction between members.

## Goal

Hide team scores (and the balance bar) until each team has a meaningful number of players, preventing small-group comparisons while still surfacing scores once the lineup resembles a real team.

---

## Design

### Threshold

`MIN_PLAYERS = 4` per team. Both teams must independently reach this threshold.

- Prevents 1v1, 2v2, and 3v3 cherry-picking.
- Aligns with 5-a-side context (4 per side is close to a real team).
- Single constant makes the threshold easy to adjust in future.

### Score badges

Each team column header always shows the score badge. Behaviour changes by team size:

| Team size | Badge content |
|---|---|
| < 4 players | `—` (em dash placeholder) |
| ≥ 4 players | `score.toFixed(3)` (existing numeric score) |

The two teams are evaluated independently — one team can reveal its score while the other still shows `—`.

### Balance bar

The win-probability bar (percentages + coloured bar) requires **both** teams to have ≥ 4 players before rendering. This replaces the existing condition of `teamA.length > 0 && teamB.length > 0`.

---

## Scope

- **File changed:** `components/LineupLab.tsx` only.
- No new components, no API changes, no type changes, no migrations.

---

## Out of scope

- Tooltips or messaging explaining why the score is hidden (keep it simple).
- Configurable threshold via feature flags (hardcoded constant is sufficient).
