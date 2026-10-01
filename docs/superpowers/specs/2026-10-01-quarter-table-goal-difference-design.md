# Goal difference in quarter tables — design

**Date:** 2026-10-01

## Summary

Add a GD (goal difference) column to the quarter standings tables, and use it
as a tiebreaker. Each game's margin of victory is applied to every player who
played in it: the winners get `+margin`, the losers get `-margin`, a draw adds
nothing. Also add a "fewer games played ranks higher" tiebreaker after GD.

## Data model constraint

A played game (`Week`) stores only `winner` (`teamA` | `teamB` | `draw`) and
`goal_difference`: a non-negative integer for the whole-game margin (`0` for a
draw, `null` when not recorded). There are no per-team goal tallies, so a
classic goals-for minus goals-against cannot be computed. GD here is the sum of
signed margins across the games a player played.

## Decisions (settled during brainstorming)

1. **Signed GD.** For each played game a player appears in:
   - their team won: `+goal_difference`
   - their team lost: `-goal_difference`
   - draw: `0`
2. **Unrecorded margin counts as 0.** A played game with
   `goal_difference = null` adds 0 to GD. It still counts towards P/W/D/L/Pts
   exactly as today.
3. **Ranking order** (replaces `points → won → name`):

   | # | Key | Direction |
   |---|---|---|
   | 1 | Points | Higher first |
   | 2 | GD | Higher first |
   | 3 | Played | Fewer first |
   | 4 | Won | Higher first |
   | 5 | Name | A to Z |

4. **Scope: quarter tables only.** GD appears in the sidebar quarter table and
   the honours board's per-quarter standings. All-time player stats (players
   list, `PlayerCard`, Your Stats widget, the `get_player_stats*` SQL RPCs) are
   out of scope. No database or migration changes.
5. **No new feature flag.** GD is a column and a tiebreak on tables that
   already exist and are already gated, not a new feature.

## Changes

### `lib/sidebar-stats.ts`

- Add `goalDiff: number` to `QuarterlyEntry`.
- In `aggregateWeeks`, initialise `goalDiff: 0`. Inside the existing
  per-player loop, after the win/draw/loss branch, apply the signed margin:
  `margin = w.goal_difference ?? 0`; add `margin` on a win, subtract it on a
  loss, nothing on a draw.
- Replace the comparator with:

  ```ts
  b.points - a.points || b.goalDiff - a.goalDiff || a.played - b.played || b.won - a.won || a.name.localeCompare(b.name)
  ```

`aggregateWeeks` feeds both `computeQuarterlyTable` (sidebar) and
`computeAllQuarters` (honours), so this one change covers both.

### `components/StatsSidebar.tsx` — `QuarterlyTableWidget`

- Header: add `<span>GD</span>` between `L` and `Pts`, centred, matching the
  existing header spans.
- Row: add a GD cell between L and Pts, same styling as the P/W/D/L cells,
  width about `w-[26px]` to fit values such as `+12` and `-12`. The name
  column already truncates and takes up the lost space.

### `components/HonoursSection.tsx` — `CompletedCardBody`

- Header and row: add a GD column between `L` and `Pts`, centred, about
  `w-7`, same styling as the P/W/D/L cells.

### Display format

GD is shown signed: `+5`, `0`, `-3`. Put a small `formatGoalDiff(n)` helper in
`lib/utils.ts` and use it in both components.

## Consequences

- **Champion selection changes on ties.** The quarter champion is
  `entries[0]`. When points are level, GD now decides the title, then fewer
  games played, then wins. This affects everything that reads the top entry:
  the sidebar's previous-quarter champion banner, `QuarterSummary.champion`
  on the honours board (and so the quarter wrap celebration), the Champion
  award in `buildQuarterAwards`, and the quarter share text
  (`lib/utils.ts`, "Your … champion"). Past quarters whose champion was
  decided on a points tie may show a different champion.
- **Sidebar top 10.** The sidebar slices to 10 entries after sorting, so the
  new tiebreakers can change who appears at the bottom of the list.

## Testing

Add to `lib/__tests__/sidebar-stats.quarters.test.ts`:

- Signed accumulation: winners get `+margin`, losers `-margin`, a draw gives 0
  to both sides.
- A played game with `goal_difference: null` adds 0 to GD but still counts
  P/W/L/Pts.
- GD sums across several games, including mixed wins and losses.
- Sort: equal points, higher GD ranks first.
- Sort: equal points and GD, fewer games played ranks first.
- Sort: equal points, GD and played, more wins ranks first, then name.
- Champion: in a quarter where points are tied, the player with the higher GD
  is the champion.

Add a `formatGoalDiff` test (`+5`, `0`, `-3`).

Update the `QuarterlyEntry` fixture builder in
`lib/__tests__/utils.quarterShare.test.ts` so it sets `goalDiff`, because the
field is now required.

Verification: `npm test`, `npm run lint`, `npx tsc --noEmit`, and a visual
check of the sidebar and honours tables at narrow widths.
