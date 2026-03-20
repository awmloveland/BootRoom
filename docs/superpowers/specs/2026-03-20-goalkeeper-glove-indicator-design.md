# Goalkeeper Glove Indicator — Design Spec

**Date:** 2026-03-20
**Branch:** awmloveland/goalkeeper-glove-indicator

---

## Overview

Players with `goalkeeper: true` on their profile should display a 🧤 emoji after their name in all team lineup contexts. Example: "Alice" becomes "Alice 🧤".

The `goalkeeper` flag already exists on the `Player` type. The gap is that team lineups store player names as plain `string[]`, so goalkeeper metadata must be threaded separately from the server down to the rendering components.

---

## Scope

### Where the 🧤 appears
- Historical match result cards (collapsible MatchCard team lists) — member/admin tier only
- Scheduled/upcoming lineup card (NextMatchCard lineup state) — member/admin tier only
- Auto-pick team builder draggable tiles (NextMatchCard building state) — member/admin tier only

### Where the 🧤 does NOT appear
- Player selection pills (the attendance buttons before auto-pick)
- Public tier — no player data is fetched for unauthenticated users; goalkeeper badges are not shown
- Guest players added via the guest input — these resolve to `goalkeeper: false` by design in `resolvePlayersForAutoPick`, so no badge is shown

---

## Design

### 1. `TeamList` — add optional `goalkeepers` prop

```tsx
interface TeamListProps {
  label: string
  players: string[]
  goalkeepers?: string[]
}
```

When rendering each player `<li>`, append ` 🧤` if `goalkeepers?.includes(player)` is true. The prop is optional so all existing call sites without goalkeeper data continue to work with no change.

`string[]` is used throughout the component chain (rather than `Set<string>`) because `results/page.tsx` is a Server Component and `Set` cannot cross the server→client serialization boundary in Next.js App Router. Player counts in this app are small enough that `Array.includes()` is adequate.

### 2. `MatchCard` — pass through to `PlayedCard`

Add `goalkeepers?: string[]` to `MatchCardProps`. The outer `MatchCard` export forwards the prop to `PlayedCard` (the internal sub-component that actually renders the team lists). `PlayedCard` passes it to both `<TeamList>` calls (teamA and teamB). `CancelledCard` receives no prop and needs no change — it renders no lineup.

### 3. `WeekList` — pass through

Accepts `goalkeepers?: string[]` and forwards it to each `<MatchCard>`. No logic — pure prop threading.

`PublicMatchList` is **not changed** — it calls `MatchCard` without a `goalkeepers` prop by design. Since the prop is optional, `MatchCard` renders no badges, which is the correct public-tier behaviour. This is intentional, not an oversight.

### Name matching

`goalkeepers.includes(player)` uses strict string equality. The array is built from `Player.name` values, and `week.teamA`/`teamB` entries are recorded from the same source at lineup time. Strict equality is acceptable here — data entry is controlled through the team builder, which uses canonical player names. No normalisation is required.

### 4. `NextMatchCard` — two locations

**Lineup state** (renders `<TeamList>` with `scheduledWeek.teamA` / `.teamB`):

Derive the goalkeeper array inline (client-side, so `Set` is also fine internally, but the prop type is `string[]` for consistency):

```ts
const goalkeepers = allPlayers.filter(p => p.goalkeeper).map(p => p.name)
```

Pass to both `<TeamList>` renders in the lineup state.

Note: `NextMatchCard` is also rendered via `PublicMatchEntrySection` in the public tier, where `allPlayers` defaults to `[]`. In that case `goalkeepers` will be an empty set and no badges are shown — which is the correct public-tier behaviour per scope.

**Auto-pick builder tiles** (the draggable `Player[]` rows in `renderTeam`):

Add `{p.goalkeeper && ' 🧤'}` after `{p.name}` in the player name span. `p.goalkeeper` is already present on the `Player` object. Guest players resolved via `resolvePlayersForAutoPick` always have `goalkeeper: false`, so they correctly display no badge.

### 5. Page data fetch — extend condition

**Current behaviour:** `if (tier !== 'public' && canSeeMatchEntry)` — players are only fetched when match entry is enabled.

**New behaviour:** `if (tier !== 'public' && (canSeeMatchHistory || canSeeMatchEntry))` — fetch players whenever a member/admin can see either match history or match entry, since either may need the goalkeeper set to annotate team lists.

The page derives:
```ts
const goalkeepers = players.filter(p => p.goalkeeper).map(p => p.name)
```

Passes `goalkeepers: string[]` to `<WeekList>` (new prop). Using `string[]` (not `Set`) because `results/page.tsx` is a Server Component and `Set` cannot cross the server→client serialization boundary. `<ResultsRefresher>` already receives `allPlayers` and passes it to `NextMatchCard`, which derives its own goalkeeper set internally (see §4 above).

---

## Component changes summary

| Component | Change |
|---|---|
| `components/TeamList.tsx` | Add `goalkeepers?: string[]` prop; append 🧤 via `includes()` check |
| `components/MatchCard.tsx` | Add + forward `goalkeepers?: string[]` prop through to `PlayedCard` → `TeamList` |
| `components/WeekList.tsx` | Add + forward `goalkeepers?: string[]` prop to `MatchCard` |
| `components/NextMatchCard.tsx` | Derive goalkeeper set from `allPlayers`; pass to `TeamList` in lineup state; add emoji to builder tiles |
| `app/[leagueId]/results/page.tsx` | Extend player fetch condition to `canSeeMatchHistory \|\| canSeeMatchEntry`; derive `goalkeepers` Set; pass to `WeekList` |

`PublicMatchList` — **no change**.

---

## No database changes

The `goalkeeper` flag is already stored on player profiles. No migrations needed.

## No feature flag

This is a display enhancement to existing data, not a new feature requiring admin gating. It applies immediately for all member/admin tiers once deployed.
