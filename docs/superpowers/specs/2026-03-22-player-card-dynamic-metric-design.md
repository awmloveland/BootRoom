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

### Edge cases

**Win Rate — zero games played:** `Player.winRate` is always a `number` (never null/undefined). A player with 0 games will have `winRate = 0`, which renders as `0.0% win rate`. This is acceptable — no special fallback needed.

**Won — zero wins:** `Player.won` is always a `number`. Zero wins renders as `0 wins`. This is acceptable — no special fallback needed.

**Recent Form — empty string:** `Player.recentForm` is a `string` (e.g. `'WWDLW'`, `'--WLW'`). When a player has no form data the field is `''`. `FormDots` with an empty string renders nothing. To avoid a blank chip, `PlayerCard` must fall back to `{p.played} games` when `recentForm` is empty and sort is `recentForm`.

### Styling

For Won and Win Rate: numeric value in `font-semibold text-slate-100`, trailing label (`wins`, `win rate`) in `text-xs text-slate-400`.

For Recent Form: `<FormDots>` renders W/D/L letters in `font-mono text-xs font-bold` with colours sky-400 / slate-400 / red-400. Dashes (`-`) render in slate-700 (near invisible, intentional).

**Colour note:** The expanded card body uses `<RecentForm>` which renders W in green-400 (an older style). The header will use `<FormDots>` which renders W in sky-400. This divergence is intentional and acceptable for this iteration — updating `RecentForm` to match is out of scope.

## Architecture

### `SortKey` type — move to `lib/types.ts`

`SortKey` is currently defined inline in `PublicPlayerList.tsx`. Since `PlayerCard` now needs to import it, move the type to `lib/types.ts` to avoid a sibling component import dependency.

```ts
// lib/types.ts (add)
export type SortKey = 'name' | 'played' | 'won' | 'winRate' | 'recentForm'
```

Update `PublicPlayerList.tsx` to import `SortKey` from `@/lib/types` instead of defining it locally.

### Data flow

`PublicPlayerList` holds `sortBy: SortKey` state and passes it as a new prop to each `PlayerCard`. No other components or data fetching change.

### `PlayerCard` changes

**New prop:** `sortBy: SortKey`

**New config map** inside `PlayerCard.tsx`. `Player.recentForm` is `string` — passed directly as the `form: string` prop that `FormDots` expects:

```tsx
const HEADER_METRIC: Record<SortKey, (p: Player) => React.ReactNode> = {
  name:       (p) => `${p.played} games`,
  played:     (p) => `${p.played} games`,
  won:        (p) => (
    <><span className="font-semibold text-slate-100">{p.won}</span>
    <span className="text-xs text-slate-400"> wins</span></>
  ),
  winRate:    (p) => (
    <><span className="font-semibold text-slate-100">{p.winRate.toFixed(1)}%</span>
    <span className="text-xs text-slate-400"> win rate</span></>
  ),
  recentForm: (p) =>
    p.recentForm ? <FormDots form={p.recentForm} /> : `${p.played} games`,
}
```

The hardcoded `{player.played} games` span in the card header is replaced with:

```tsx
<span className="text-xs text-slate-400 flex items-center gap-1">
  {HEADER_METRIC[sortBy](player)}
</span>
```

This wrapper is used unconditionally for all `sortBy` values, including the plain-string cases (`name`, `played`, and the empty-`recentForm` fallback). Plain strings are valid JSX children inside a flex span. The `text-xs text-slate-400` defaults apply to string children; `FormDots` overrides colours via its own per-character class names.

### `PublicPlayerList` changes

Pass `sortBy={sortBy}` to each `<PlayerCard>`.

## Files changed

| File | Change |
|---|---|
| `lib/types.ts` | Add `SortKey` export |
| `components/PublicPlayerList.tsx` | Import `SortKey` from `@/lib/types`; pass `sortBy` prop to `<PlayerCard>` |
| `components/PlayerCard.tsx` | Import `SortKey` from `@/lib/types`; add `sortBy` prop; add `HEADER_METRIC` map; replace hardcoded chip |

## Files unchanged

- `components/FormDots.tsx` — imported as-is, `form: string` prop matches `Player.recentForm`
- `components/RecentForm.tsx` — used in expanded body only, not affected
- All API routes, data fetching, and feature flag logic
