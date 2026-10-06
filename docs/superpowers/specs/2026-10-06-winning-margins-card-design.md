# Winning Margins card: design

**Date:** 2026-10-06

**Design source:** brainstorming mockups (option C3, "Close games"), built at
sidebar width with live `craft-football` numbers. The mockups are not checked
in; this spec carries every value they used.

## Summary

A new stats card, **Winning Margins**, that answers "by how much do games
usually get won?". It shows the average winning margin, the biggest win, a
chart of how often each margin happens (draws included) and the share of close
games. It sits directly under Head to Head in the desktop sidebar and on the
Overview tab, behind a new `margin_stats` feature flag.

## Decisions (settled during brainstorming)

1. **A separate card, not an extended Head to Head.** Head to Head keeps its
   name and content unchanged.
2. **Variant C3.** Draws get their own bar, and the footer shows close games.
   No per-team split in the chart.
3. **All time only**, matching Head to Head. No quarter view; the Records tab
   already covers biggest wins in depth.
4. **Behind a feature flag**, per the feature development standard:
   `margin_stats`, seeded `enabled: false, public_enabled: false`.
5. **Hidden until the league has 10 wins.** Ten counted wins
   (`MIN_MARGIN_WINS = 10`) is where the average settles to within about half
   a goal and the chart has a real shape. Draws do not count towards it.
   Below the threshold the card is hidden from members and the public; admins
   still see it, with a hint line showing progress. The threshold is a
   constant in code, not an admin setting.

## Data model constraint

Weeks store `winner` and an unsigned `goal_difference` (the margin), never
per-team goals. Goals per game and total goals cannot be computed, so every
figure on this card is derived from the margin.

## Stats and rules

Input: all weeks. Only `status === 'played'` weeks count.

| Field | Rule |
|---|---|
| Counted games | Played weeks that are a draw, or a win with a non-null `goal_difference`. Wins with a null margin are skipped everywhere. |
| Draw margin | A draw counts as margin 0 even when `goal_difference` is null. |
| `avgWinMargin` | Mean margin of counted wins (draws excluded). Displayed to one decimal place (`2.9`). `null` when there are no counted wins. |
| `biggestWin` | Largest margin among counted wins. `null` when none. |
| `buckets` | Eight counts in order: draws, then margins 1, 2, 3, 4, 5, 6, and 7+ (any margin of 7 or more). |
| `modeMargin` | The win margin (1 to 7, where 7 means the 7+ bucket) with the highest count. Ties go to the smaller margin. Draws are never the mode. `null` when there are no counted wins. |
| `closeGamePct` | `(wins by exactly 1 + draws) / counted games`, as a whole percentage rounded to nearest. `null` when there are no counted games. |
| `counted` | Number of counted games. |
| `winCount` | Number of counted wins (excludes draws). Compared against `MIN_MARGIN_WINS`. |

A margin of 0 recorded on a week whose `winner` is not `'draw'` cannot happen
(the UI enforces 1 to 20 for wins) and is ignored if it does.

For reference, `craft-football` on 2026-10-06: 51 played, avg 2.9, biggest +7,
buckets `[7, 11, 10, 10, 4, 3, 5, 1]`, mode 1, close games 35%.

## Card layout

Uses the existing `WidgetShell` and `AllTimeChip` from
`components/StatsSidebar.tsx`, with the `sidebar` and `page` sizes.

- **Header:** title "Winning Margins", `AllTimeChip` on the right.
- **Top row** (`flex items-end justify-between`, `mb-3.5`):
  - Left: average as a 34px Space Grotesk bold number in `#f4f9ff`, with a
    plex meta label "Avg goals per win" beneath it.
  - Right: biggest win as `+7` in 15px Space Grotesk bold, lime `#bef264`,
    with the meta label "Biggest" beneath it, right aligned.
  - If there are draws but no counted wins, show `-` in place of the average
    and hide the biggest win block.
- **Chart:** eight columns in a 56px tall row, `gap` 5px, bars aligned to the
  bottom with `rounded-t-[2px]`. Bar height is `count / maxCount * 100%`; an
  empty bucket renders no bar but keeps its column.
  - Draws bar: `#2c4a72`.
  - Win bars: `#223a5c`.
  - Mode bar: `#38bdf8`.
- **Axis labels** under each column, plex 8.5px, `#4f688a`: `D 1 2 3 4 5 6 7+`.
- **Hairline** `#17263c`, then the footer as a plex meta line:
  "Close games · **35%** · 1 goal or a draw", with the percentage bold in
  `#f4f9ff`.
- **Meta label style:** `font-plex text-[8.5px] uppercase tracking-[.14em]
  text-[#6f88a8]`, written in normal case in JSX.
- **Empty:** there is no "No results yet" state. With no counted games the
  win count is 0, so only admins can see the card, and they get the hint.
- **Admin hint:** when the card is shown below the threshold (admins only),
  a meta line sits under the footer in `#4f688a`:
  "Visible to non-admins after 10 wins · **4** so far", with the count bold in
  `#8ba4c4`. When `counted === 0` the hint is the only body content,
  reading "0 so far".

Bar heights use an inline `style={{ height }}`, the same data-driven exception
Head to Head already uses for its split bar widths. Everything else is
Tailwind.

## Where it renders

- **Sidebar:** `StatsSidebar` renders `<MarginsWidget weeks={weeks}
  isAdmin={isAdmin} />` after `TeamABWidget`, only when the new
  `canSeeMargins` prop is true. `StatsSidebar` also gains an `isAdmin` prop.
- **Overview:** `app/[slug]/(tabs)/overview/page.tsx` renders
  `<MarginsWidget weeks={weeks} size="page" isAdmin={isAdmin} />` after
  `TeamABWidget`, only when `canSeeMargins` is true.
- **Threshold:** `MarginsWidget` returns `null` when
  `winCount < MIN_MARGIN_WINS` and `isAdmin` is false. When `isAdmin` is true
  it always renders, adding the admin hint below the threshold.

## Feature flag wiring

Follows `docs/FEATURE_FLAGS.md`.

1. Add `'margin_stats'` to `FeatureKey` in `lib/types.ts`.
2. Add a `DEFAULT_FEATURES` entry in `lib/defaults.ts`:
   `enabled: false, public_enabled: false`.
3. Add a `FeaturePanel` row (`FeatureToggleCard`), title "Winning Margins",
   description: "Show the average winning margin, biggest win and close games
   under Head to Head, once the league has 10 wins. Admins always see it;
   choose who else does." Also add the label to `FEATURE_LABELS` in
   `app/experiments/page.tsx` (a `Record<FeatureKey, string>`).
4. Migration `supabase/migrations/20261006000002_seed_margin_stats.sql`,
   matching `20261005000001_seed_lineup_share_image.sql`: insert into
   `feature_experiments` and seed `league_features` for every game.
5. `LeagueSidebar` in `app/[slug]/(tabs)/layout.tsx` already loads `features`
   and `userRole`; it computes
   `isFeatureEnabled(features, 'margin_stats', resolveVisibilityTier(userRole))`
   and passes `canSeeMargins` to `StatsSidebar`. The Overview page computes the
   same value from its existing `features` and `tier`.

Production migrations can lag behind `main`, so the seed may need applying by
hand in the Supabase SQL Editor before admins see the card.

## Code units

- `computeMargins(weeks: Week[]): MarginStats` in `lib/sidebar-stats.ts`, next
  to `computeTeamAB`. `MarginStats` is added to `lib/types.ts`.
- `MIN_MARGIN_WINS = 10` exported from `lib/sidebar-stats.ts`.
- `MarginsWidget({ weeks, size, isAdmin })` exported from
  `components/StatsSidebar.tsx`.

## Testing

`__tests__/sidebar-stats.test.ts`, `computeMargins`:
- no weeks, and only non-played weeks: `counted` 0, all stats null.
- draws with null `goal_difference` count as margin 0.
- wins with null `goal_difference` are skipped.
- margins of 7 and above land in the 7+ bucket.
- a tie for most common margin goes to the smaller margin.
- `avgWinMargin` excludes draws; `closeGamePct` includes them.
- only draws: average, biggest and mode are null; close games is 100%.
- `winCount` excludes draws and wins with a null margin.

`__tests__/stats-sidebar.test.tsx`:
- `MarginsWidget` renders the average, biggest win, axis labels and footer.
- with no counted games, an admin sees only the hint.
- below 10 wins: renders nothing for a non-admin; renders with the hint
  "Visible to non-admins after 10 wins · N so far" for an admin.
- at exactly 10 wins: renders for a non-admin, with no hint for an admin.
- `StatsSidebar` hides the card when `canSeeMargins` is false and shows it
  when true.
