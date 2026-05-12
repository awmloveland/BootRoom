# Strength consolidation: unify strength hint + eye test rating

**Date:** 2026-05-12
**Status:** Design approved, awaiting implementation plan

## Overview

The app currently has two parallel mechanisms for expressing a player's "raw strength":

- **Strength hint** (`'below' | 'average' | 'above'`) — collected in the lineup builder (`AddPlayerModal`) and the rename-guest flow (`NameGuestModal`). Used to derive a `wprOverride` for unresolved lineup players via `hintToWpr()`.
- **Eye test rating** (`1 | 2 | 3` integer) — stored on `player_attributes.rating`. Used as a 15%-weighted prior in `wprScore()` that fades linearly to zero by 10 games played.

These two concepts represent the same thing (a coarse human judgment of a player's relative quality) but live in different fields, have different UIs, and connect inconsistently:

- The "name guest" flow converts hint → rating via `strengthHintToRating()` (`lib/guestName.ts:9`).
- The "add new player in lineup" flow collects a hint but **hardcodes `rating: 2`** at `AddPlayerModal.tsx:76`, silently dropping the hint when the player is promoted to the roster.

This spec consolidates the two concepts into a single canonical app-level type, `Strength = 'below' | 'average' | 'above'`, used everywhere in the TypeScript codebase. The DB column `player_attributes.rating int` stays as the storage representation; conversion happens at the boundaries. As part of the same change, the roster panel hides the strength control entirely for players with `played >= 10`, since the rating prior's weight has decayed to zero and editing it is misleading.

## Decisions

| # | Question | Choice | Rationale |
|---|---|---|---|
| 1 | What field does the (eventual) settings add-player form collect? | Strength (below/avg/above) | Original ask is deferred (out of scope); choice informed approach for this spec |
| 2 | Canonical TS representation | `Strength` enum (`'below' \| 'average' \| 'above'`) | Mental model matches storage of a 3-bucket value better than `rating: number` |
| 3 | UX for `played >= 10` players in roster panel | Hide the control entirely | Cleanest signal that the value no longer matters |
| 4 | UX for unrated (`rating === 0`) players | No pill selected | Honest "needs your input" state; admin must explicitly choose |
| 5 | Scope | Approach 2: type rename + UI consolidation + LineupMetadata key rename. DB column unchanged. | DB rename gains nothing once boundary conversion is in place |

## Architecture

### Type system

A new alias replaces both `StrengthHint` and the implicit `rating: 1 | 2 | 3`:

```ts
// lib/types.ts
export type Strength = 'below' | 'average' | 'above'
```

Affected types (all in `lib/types.ts`):

- `PlayerAttribute.rating: number` → `strength: Strength | null`
- `Player.rating: number` → `strength: Strength | null`
- `NewPlayerEntry`: drop `rating: number`; replace `strengthHint: StrengthHint` with `strength: Strength`
- `GuestEntry`: drop `rating: number`; replace `strengthHint: StrengthHint` with `strength: Strength`
- `LineupMetadata.guests[].strength_hint` → `.strength: Strength`
- `LineupMetadata.new_players[].strength_hint` → `.strength: Strength`

`StrengthHint` is removed; all references migrate to `Strength`.

### Boundary conversion module

A new file `lib/strength.ts` owns both conversion directions plus the type alias re-export:

```ts
// lib/strength.ts
import type { Strength } from '@/lib/types'

export function strengthToRating(strength: Strength): number {
  switch (strength) {
    case 'below':   return 1
    case 'average': return 2
    case 'above':   return 3
  }
}

export function ratingToStrength(rating: number): Strength | null {
  if (rating === 1) return 'below'
  if (rating === 2) return 'average'
  if (rating === 3) return 'above'
  return null  // rating === 0 (unset) or out-of-range
}
```

The existing `strengthHintToRating` in `lib/guestName.ts` is removed; `guestName.ts` returns to being focused on guest-name-pattern logic only.

### Read boundaries (DB → app)

- `lib/fetchers.ts` (player and lineup hydration paths) map `rating: int` to `strength: Strength | null` via `ratingToStrength`.
- `lib/data.ts` (`fetchPlayers`) same conversion.
- `LineupMetadata` JSON readers accept either `strength` (new) or `strength_hint` (old) key during the deprecation window: `entry.strength ?? entry.strength_hint ?? null`.

### Write boundaries (app → DB)

- `promote_roster` RPC caller in `ResultModal.handleSave` converts `strength → rating` via `strengthToRating` before building the entries array. RPC signature unchanged.
- `/api/league/[id]/players/[name]` PATCH route accepts `{ strength: Strength }` (new) and `{ rating: number }` (old, deprecated for one release). Converts to int internally before writing.
- `/api/league/[id]/guests/name` POST route accepts `{ strength: Strength }` (new) and `{ strengthHint: Strength }` (old, deprecated for one release).
- Public auto-sync path (`/api/public/league/[id]/result/route.ts:90-99`) is unchanged — continues to upsert minimal `(name)` rows defaulting to `rating=0`, which the app reads as `strength: null`.

### `wprScore` internals

`wprScore` in `lib/utils.ts:110` keeps its math identical. The function now receives `Player.strength: Strength | null` instead of `Player.rating: number`. The component-3 block at lines 134-137 is rewritten so the neutral-prior branch keys off `strength === null` rather than `rating === 0`:

```ts
// Component 3: strength prior, fades as played increases
const normRating = player.strength === null
  ? 50
  : ((strengthToRating(player.strength) - 1) / 2) * 100
const ratingWeight = Math.max(0, 1 - player.played / 10)
const ratingScore = normRating * ratingWeight
```

The 15% weight (`WPR_RATING_WEIGHT`), the linear fade by 10 games, and all numeric outputs for any given input are unchanged. `strengthToRating` is imported from `lib/strength.ts`.

`hintToWpr` in `lib/utils.ts:295` keeps its math identical. Its parameter type changes from `StrengthHint | undefined` to `Strength | null`. The `'above'` / `'below'` / fallthrough branches behave the same.

## Shared component

A single presentational component at `components/ui/StrengthPills.tsx` is used in all three input surfaces.

```ts
interface StrengthPillsProps {
  value: Strength | null
  onChange: (next: Strength) => void
  disabled?: boolean
  size?: 'sm' | 'md'
  ariaLabel?: string
}
```

Behavior:

- Three pills rendered in order: `Below | Average | Above`.
- `value === null` → no pill highlighted.
- `value !== null` → matching pill highlighted.
- Clicking a pill calls `onChange(next)`. There is no clear/unset affordance.
- `disabled` greys all pills and blocks interaction.

Styling mirrors the existing mentality segmented control:

- Selected: `bg-slate-700 text-slate-100 border-slate-500`
- Unselected: `bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600`
- All conditional classes via `cn()` from `lib/utils.ts`.

Usage replaces the existing inline pill code in `AddPlayerModal.tsx` (lines 257-281) and `NameGuestModal.tsx` (lines 114-134), and the dot control in `PlayerRosterPanel.tsx` (lines 199-211, 264-280).

## Surface-level changes

### PlayerRosterPanel (`components/PlayerRosterPanel.tsx`)

1. The 1-3 dot row is removed entirely (component and all related state).
2. A new conditional row is added:
   ```tsx
   {player.played < 10 && (
     <StrengthPills
       value={player.strength}
       onChange={(s) => handleStrengthChange(player.name, s)}
       size="sm"
     />
   )}
   ```
3. For `played >= 10`, the row is not rendered. The mentality picker, link-to-member, and rename affordances above/below stay as today.
4. Section label and any "Eye test" copy → "Strength".
5. Mobile collapsed-row summary that shows the dot count → shows the pill label (`Below` / `Average` / `Above`), or omits the field entirely if `strength === null` or `played >= 10`.
6. `handleStrengthChange` replaces `handleRatingChange`; PATCH body becomes `{ strength: Strength }`.

### AddPlayerModal (`components/AddPlayerModal.tsx`)

1. Inline pills (lines 257-281) replaced with `<StrengthPills size="md" />`.
2. Local state: `useState<Strength>('average')` for both `newStrength` and `guestStrength`. Default `'average'` is preserved because forcing a choice in a creation flow is reasonable; the "no pill selected" state only applies to existing unrated roster players.
3. Emit payloads:
   - `handleAddNewPlayer` → `{ type: 'new_player', name, strength: newStrength, mentality: newMentality }` (drops `rating: 2`).
   - `handleAddGuest` → `{ type: 'guest', name, associatedPlayer, strength: guestStrength, goalkeeper: guestIsGoalkeeper }` (drops `rating: 2`).

### NameGuestModal (`components/NameGuestModal.tsx`)

1. Inline pills (lines 114-134) replaced with `<StrengthPills size="md" />`.
2. Local state `strengthHint` → `strength`, typed `Strength`. Default `'average'`.
3. Submit payload to `/api/league/[id]/guests/name`: `{ ..., strength }`.

### ResultModal (`components/ResultModal.tsx`)

The `promote_roster` RPC call in `handleSave` (around line 219) converts before building entries:

```ts
const entries = [
  ...newPlayerStates.map((p) => ({
    name: p.name,
    rating: strengthToRating(p.strength),    // was: p.rating (always 2)
    mentality: p.mentality,
    goalkeeper: p.mentality === 'goalkeeper',
  })),
  ...guestStates
    .filter((g) => g.addToRoster && g.rosterName.trim())
    .map((g) => ({
      name: g.rosterName.trim(),
      rating: strengthToRating(g.strength),  // was: g.rating (always 2)
      goalkeeper: g.goalkeeper,
    })),
]
```

This is the latent-bug fix: a strength chosen at lineup time now persists to the permanent roster row.

### NextMatchCard (`components/NextMatchCard.tsx`)

`hintToWpr` call sites use `g.strength` / `p.strength` instead of `g.strengthHint` / `p.strengthHint`. LineupMetadata reads (`lines 316, 324`) accept either key during deprecation. LineupMetadata writes (`lines 375, 383`) emit only `strength`.

### API routes

- `app/api/league/[id]/players/[name]/route.ts`: `parsePlayerPatch` (`lib/playerUtils.ts:19`) gains a `strength` branch that maps to int via `strengthToRating` before persistence. The existing `rating` branch stays, marked deprecated, for one release.
- `app/api/league/[id]/guests/name/route.ts`: accepts `body.strength` (new) and falls back to `body.strengthHint` (old). Both convert via `strengthToRating`.

## Backward compatibility

No DB migration. Three short-lived read fallbacks during one release:

| Location | New key | Old key still accepted on read |
|---|---|---|
| LineupMetadata `guests[]` / `new_players[]` JSON | `strength` | `strength_hint` |
| `/api/league/[id]/guests/name` body | `strength` | `strengthHint` |
| `/api/league/[id]/players/[name]` PATCH body | `strength` | `rating` |

Writes only emit the new key/shape. A follow-up janitorial PR (≈one release later) removes the fallbacks.

## Testing

- New `lib/__tests__/strength.test.ts` covers `strengthToRating` (3 cases) and `ratingToStrength` (5 cases: 0, 1, 2, 3, and an out-of-range value).
- Existing `lib/__tests__/guestName.test.ts` loses the `strengthHintToRating` block; keeps the `isGuestName` and `validateNameGuestInput` blocks.
- Existing `wprScore` tests are updated where they construct `Player` fixtures with `rating: number`; same numeric expectations should hold since the math is unchanged.
- New unit test for `StrengthPills`: renders three pills, highlights the matching one for each value, no pill highlighted for `null`, `onChange` fires with the right value.
- New integration / behavior test for `PlayerRosterPanel`: pills render for `played < 10`, do not render for `played >= 10`.
- New integration test for the promote-roster path: a new player added with `strength: 'above'` ends up in `player_attributes` with `rating = 3` (regression guard for the hardcoded-2 bug).

## Rollout

Single PR, single deploy. The change touches enough interdependent types that splitting it across PRs would leave intermediate states with broken builds.

Order of operations within the PR:

1. Add `Strength` type alias and `lib/strength.ts` with both converters.
2. Update `lib/types.ts` interfaces (`PlayerAttribute`, `Player`, `NewPlayerEntry`, `GuestEntry`, `LineupMetadata`).
3. Update fetchers (`lib/fetchers.ts`, `lib/data.ts`) to convert at the read boundary.
4. Update `wprScore` and `hintToWpr` signatures.
5. Add `StrengthPills` component.
6. Update `AddPlayerModal`, `NameGuestModal`, `PlayerRosterPanel` to use it.
7. Update `ResultModal.handleSave` to use `strengthToRating` (the bug fix).
8. Update `NextMatchCard` lineup metadata reads/writes.
9. Update API routes with new-key acceptance + old-key fallback.
10. Update + add tests.
11. Manually verify the four flows in dev: roster edit, add-player-in-lineup, name-guest, public auto-sync displays correctly.

## Out of scope

- Renaming the DB column `player_attributes.rating`. Staying as `int`, never touched.
- A "Re-rate" button for established players who return after a long break. Deferred until there's a concrete case.
- Adding a player from the settings/players tab (the original request that prompted this spec). Will be a separate spec built on top of this consolidated control.
- Any change to `wprScore` weighting, the 10-game fade curve, or `hintToWpr` math.
- Any change to `promote_roster` RPC signature or other SQL.
