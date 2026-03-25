# Player Roster Settings Tab — Design Spec

**Date:** 2026-03-25
**Status:** Approved

---

## Overview

Add a **Players** tab to the league Settings page. Admins can view all players in the roster, adjust each player's eye-test rating (1–3), and set their mentality (GK / DEF / BAL / ATT). Changes save automatically on interaction — no Save button required.

---

## Settings Tab

- New tab added to the settings nav: **Details · Members · Features · Players**
- Guarded the same way as the rest of settings: admin-only (`creator` or `admin` role)
- Tab label: "Players", icon: `lucide-react` `Users2` (or `UserCog`)
- `Section` type in `settings/page.tsx` extended to include `'players'`
- Data loaded lazily on first tab activation, same pattern as Features/Members

---

## Player List

- Fetched from `GET /api/league/[id]/players` (new endpoint, admin-only)
- Returns `{ name: string; rating: number; mentality: Mentality }[]`
- Sorted alphabetically by name
- Rendered by new component `PlayerRosterPanel`

---

## Desktop Row Layout

Each row (on `md:` and above):

```
[ Player Name ]  [ ● ● ○  Rating ]  |  [ GK | DEF | BAL | ATT ]
```

- Name: `flex-1`, truncated if long
- Rating dots: 3 circles, filled blue for active, muted for inactive
  - Clicking dot N sets rating to N
  - Clicking the currently active dot decrements by 1 (minimum 1)
- Thin vertical divider (`w-px h-4 bg-slate-700`) separates rating from mentality
- Mentality segmented control: 4 segments `GK · DEF · BAL · ATT`
  - Active segment: `bg-blue-950 text-blue-300 border-blue-800` (matches existing badge palette)
  - Inactive segments: `text-slate-500`
  - Segments separated by `border-r border-slate-700`

---

## Mobile Row Layout

Collapsed state (name row only):

```
[ Player Name ]  [ BAL badge ]  [ ●●○ mini dots ]  [ chevron ▾ ]
```

- Mini dots: 6px circles, read-only indicator
- Mentality shown as the existing badge style (same as `PlayerCard`)
- Chevron rotates on expand

Expanded state (one open at a time):

```
[ Player Name ]  [ BAL badge ]  [ ●●○ mini dots ]  [ chevron ▲ ]
─────────────────────────────────────────────────
Rating:   [ 1 ]  [ 2 ]  [ 3 ]          ← full-width tap targets
Mentality: [ GK | DEF | BAL | ATT ]    ← full-width segmented control
```

- Expanded panel slides open below the name row (no modal)
- Only one player expanded at a time; opening another collapses the previous

---

## Persistence

- Every rating or mentality change fires `PATCH /api/league/[id]/players/[name]` immediately
- Request body: `{ rating?: number; mentality?: Mentality }`
- Optimistic UI update applied before the request resolves
- On error: revert to previous value, show inline error state on the affected row (red border, brief message)
- No loading spinner — change feels instant

---

## API Routes

### `GET /api/league/[id]/players`

- Auth: admin only (verify via `game_members` role check)
- Reads from `player_attributes` table
- Returns: `{ name: string; rating: number; mentality: string }[]` sorted by name
- 200 on success, 403 if not admin, 404 if league not found

### `PATCH /api/league/[id]/players/[name]`

- Auth: admin only
- Body: `{ rating?: number; mentality?: string }`
- Validates: `rating` in `[1, 2, 3]`; `mentality` in `['goalkeeper','defensive','balanced','attacking']`
- Upserts into `player_attributes` (row must already exist — no new player creation here)
- Returns 200 with updated row, 400 on bad input, 403 if not admin

---

## New Component: `PlayerRosterPanel`

- Location: `components/PlayerRosterPanel.tsx`
- Client component (`'use client'`)
- Props: `{ leagueId: string; initialPlayers: { name: string; rating: number; mentality: Mentality }[] }`
- Manages: local player state, expanded row (mobile), optimistic updates, per-row error state
- Uses existing `Mentality` type from `lib/types.ts`
- No new dependencies — plain Tailwind, `cn()`, `lucide-react` chevron

---

## Mentality Value Mapping

| UI Label | DB value (`mentality` column) |
|---|---|
| GK | `goalkeeper` |
| DEF | `defensive` |
| BAL | `balanced` |
| ATT | `attacking` |

---

## Out of Scope

- Adding new players (done via match entry flow)
- Deleting players
- Renaming players
- Viewing player stats (exists on the Players page)
- Any change to how `promote_roster()` works
