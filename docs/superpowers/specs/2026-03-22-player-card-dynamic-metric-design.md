# Player Card Dynamic Metric Chip

**Date:** 2026-03-22
**Branch:** awmloveland/player-card-dynamic-metric

## Problem

The player card header always shows `{player.played} games` regardless of the active sort. When a user sorts by Won, Win Rate, or Recent Form, the card gives no visual feedback about the metric being ranked — they have to expand a card to see the value they're comparing.

## Goal

When the sort key changes to Won, Win Rate, or Recent Form, the metric chip in each card header updates to show that player's value for the active metric. Sorting by Name or Games Played leaves the chip unchanged.

## Behaviour

| Active sort | Card header chip |
|---|---|
| Name | `18 games` (unchanged) |
| Games Played | `18 games` (unchanged) |
| Won | `14 wins` |
| Win Rate | `68.4% win rate` |
| Recent Form | `W W D L W` (FormDots component) |

For Won and Win Rate, the numeric value is rendered in `text-slate-100 font-semibold` and the trailing label (`wins`, `win rate`) in `text-slate-400 text-xs` — matching the existing chip style.

For Recent Form, the `<FormDots>` component is used directly (sky-400 W, slate-400 D, red-400 L, monospace text-xs bold).

The expanded card body (`STAT_ROWS`) is not affected — it always shows all stats regardless of sort.

## Architecture

### Data flow

`PublicPlayerList` holds `sortBy: SortKey` state and passes it as a new prop to each `PlayerCard`. No other components or data fetching change.

### `PlayerCard` changes

**New prop:** `sortBy: SortKey`

**New config map** inside `PlayerCard.tsx`:

```ts
const HEADER_METRIC: Record<SortKey, (p: Player) => React.ReactNode> = {
  name:       (p) => `${p.played} games`,
  played:     (p) => `${p.played} games`,
  won:        (p) => <><span className="font-semibold text-slate-100">{p.won}</span><span className="text-slate-400"> wins</span></>,
  winRate:    (p) => <><span className="font-semibold text-slate-100">{p.winRate.toFixed(1)}%</span><span className="text-slate-400"> win rate</span></>,
  recentForm: (p) => <FormDots form={p.recentForm} />,
}
```

The hardcoded `{player.played} games` span on line 85 of `PlayerCard.tsx` is replaced with `{HEADER_METRIC[sortBy](player)}`.

### `PublicPlayerList` changes

Pass `sortBy={sortBy}` to each `<PlayerCard>`.

## Files changed

| File | Change |
|---|---|
| `components/PlayerCard.tsx` | Add `sortBy` prop; add `HEADER_METRIC` map; replace hardcoded chip |
| `components/PublicPlayerList.tsx` | Pass `sortBy` prop to `<PlayerCard>` |

## Files unchanged

- `components/FormDots.tsx` — already a shared component, imported as-is
- `components/RecentForm.tsx` — used in expanded body only, not affected
- All API routes, data fetching, and feature flag logic
