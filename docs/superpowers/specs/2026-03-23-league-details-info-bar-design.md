# League Details Info Bar — Design Spec

**Date:** 2026-03-23
**Branch:** awmloveland/league-details-info-bar
**Status:** Approved

---

## Overview

Add a league info bar between the league title and the tab navigation on all three league tabs (Results, Players, Lineup Lab). It displays four pieces of metadata: location, day, kick-off time, and player count. A short bio sits on a second line below the facts.

This info is visible to **everyone** (members, public, and admins) once filled in. When empty, only admins see a prompt. Admins edit it via a new **League Details** tab in the league settings page.

---

## Info Bar — Filled State

### Layout (C1)

Two-line block sitting between the progress line and the tab nav in `LeaguePageHeader`:

```
📍 Hackney Marshes  ·  🕖 Thursdays · 6:30pm  ·  👥 14 players
A 6-a-side league for the regulars who've been playing together since 2019.
```

- **Line 1:** Location, day + time, and player count — inline, dot-separated (`·`), `text-sm text-slate-500`
- **Line 2:** Bio — plain text (not italic), same colour, `text-sm text-slate-500`, `leading-snug`
- Player count is always derived at render time from `players.length` on the page — **not fetched separately** (see Data Fetching below)
- Day is displayed pluralised at render time: `"Thursday"` (stored) → `"Thursdays"` (displayed). This is a simple render-time transform: append `"s"` to the stored day value. The stored value is always the singular form (e.g. `"Thursday"`).
- Day and time are concatenated as: `"{Day}s · {kickoff_time}"` e.g. `"Thursdays · 6:30pm"`
- If any individual line-1 field is null/empty it is omitted; adjacent separators are collapsed so there are no dangling `·` characters
- If **all** line-1 fields are null/empty, line 1 is not rendered at all — only line 2 (bio) appears
- If the bio is null/empty, line 2 is not rendered
- If all fields are null/empty and the viewer is not an admin, the entire info bar block is not rendered

### Visibility rules

| Viewer | At least one field filled | All fields empty |
|---|---|---|
| Admin | Shows filled info bar | Shows empty state prompt |
| Member | Shows filled info bar | Nothing rendered |
| Public | Shows filled info bar | Nothing rendered |

"Filled" means at least one of `location`, `day`, `kickoff_time`, or `bio` is non-null and non-empty.

---

## Info Bar — Empty State (Admin Only)

A dashed-border prompt strip sits where the info bar would be, only visible to admins when all four fields are null/empty:

```
┌ - - - - - - - - - - - - - - - - - - - - - - - - ┐
  Add location, schedule & a short bio   + Add details
└ - - - - - - - - - - - - - - - - - - - - - - - - ┘
```

- Container: `border border-dashed border-slate-700 rounded-md px-3 py-2 flex items-center justify-between`
- Left: `text-xs text-slate-500` — "Add location, schedule & a short bio"
- Right: `text-xs text-blue-500` link — "+ Add details" — links to `/{leagueId}/settings?tab=details`
- Only rendered when **all** stored fields (`location`, `day`, `kickoff_time`, `bio`) are null/empty AND the viewer is an admin

---

## Data Model

### TypeScript type (add to `lib/types.ts`)

```ts
export interface LeagueDetails {
  location: string | null
  day: string | null           // stored as singular: "Thursday"
  kickoff_time: string | null  // e.g. "6:30pm"
  bio: string | null
  player_count?: number        // derived at page level (players.length) — omitted if players not fetched
}
```

`LeagueDetails` is a standalone interface — it does not extend `Game`. The existing `Game` interface (`{ id, name, created_at, role }`) is not modified.

`player_count` is optional because some pages (e.g. Players) gate their player fetch behind a feature flag. When players have not been fetched, omit `player_count` from the object entirely; the info bar renders the player count chip only when `player_count` is defined. The `GET /api/league/[id]/details` endpoint always includes it (derived via `COUNT(*)` on `game_members`, falling back to `0` if the query returns null).

### New columns on `games` table

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `location` | `text` | yes | Free-text location string |
| `day` | `text` | yes | Singular day name: `"Monday"`–`"Sunday"` |
| `kickoff_time` | `text` | yes | e.g. `"6:30pm"` — selected from dropdown |
| `bio` | `text` | yes | Short free-text description |

`player_count` is **not stored** — always derived at the page level from `players.length`.

### Migration

A single migration adds the four nullable columns to `games` with no default values (`null` = not set).

---

## Data Fetching

Each league page (Results, Players, Lineup Lab) already fetches the `games` row to get the league name. Extend the existing Supabase `select` on `games` to also fetch the four new detail columns:

```ts
// Before
.select('id, name, ...')

// After
.select('id, name, location, day, kickoff_time, bio, ...')
```

Then assemble `LeagueDetails` at the page level:

```ts
const details: LeagueDetails = {
  location: game.location ?? null,
  day: game.day ?? null,
  kickoff_time: game.kickoff_time ?? null,
  bio: game.bio ?? null,
  player_count: players.length,  // players already fetched on these pages
}
```

Pass `details` and `isAdmin` down to `LeaguePageHeader`. **No separate API call is made for detail fetching on league pages.**

---

## API

### `GET /api/league/[id]/details`

Used by the settings form only (not by league pages — they fetch via extended `games` select).

- **Auth:** Publicly accessible — no session required. Uses the Supabase service client consistent with how public league pages bypass RLS.
- Returns:
```json
{
  "location": "Hackney Marshes",
  "day": "Thursday",
  "kickoff_time": "6:30pm",
  "bio": "A 6-a-side league…",
  "player_count": 14
}
```
- `player_count` in this response is derived by the API route via `COUNT(*)` on `game_members` for the given league (since the settings page does not have access to the players array).

### `PATCH /api/league/[id]/details`

- **Auth:** Admin only (creator or admin role).
- Body: `{ location?: string | null, day?: string | null, kickoff_time?: string | null, bio?: string | null }`
- Returns the updated row.

---

## Component Changes

### `LeaguePageHeader`

Add props:

```ts
details?: LeagueDetails | null
isAdmin: boolean  // already exists
```

Render `<LeagueInfoBar>` between the title block and the `<nav>` tabs.

### New `LeagueInfoBar` component (`components/LeagueInfoBar.tsx`)

Props:
```ts
interface LeagueInfoBarProps {
  details: LeagueDetails | null
  isAdmin: boolean
  leagueId: string
}
```

Logic:
- If `details` has at least one non-empty field → render filled state
- If all fields are null/empty and `isAdmin` → render empty state prompt
- Otherwise → render nothing (`null`)

Filled state rendering:
- Build line-1 items array from non-null fields only, join with ` · ` separator
- If line-1 array is empty, omit line 1 entirely
- If `bio` is non-null and non-empty, render line 2

### Settings page (`app/[leagueId]/settings/page.tsx`)

- Add `'details'` to the `Section` union type
- Add League Details as first entry in `NAV` array with `Info` icon from lucide-react
- To support the `?tab=details` deep-link, extract a small `TabInitialiser` child component that calls `useSearchParams().get('tab')` and passes the result back up (or initialises state). Wrap that child in `<Suspense>` per Next.js 14 App Router requirements — calling `useSearchParams()` outside a Suspense boundary causes a build warning and potential render failure. If `tab=details` is present, the initial `section` state is `'details'`; otherwise it defaults to `'members'`. This ensures the `+ Add details` link from the empty state prompt lands on the correct tab.
- Add `details` section render block with the `LeagueDetailsForm` component

### New `LeagueDetailsForm` component (`components/LeagueDetailsForm.tsx`)

- Fetches from `GET /api/league/[id]/details` on mount
- Controlled form with local state for all four fields
- Day dropdown: Monday–Sunday (stored and submitted as singular)
- Kick-off time dropdown: 5:00pm–9:00pm in 30-minute increments (9 values). This range covers the vast majority of amateur leagues; it is an intentional constraint for consistency.
- Player count shown as read-only with `[auto]` badge
- `PATCH` on save; on success show "Saved" on the button for 2000ms then reset (matching the `setTimeout` pattern in the existing settings page)
- On error show inline error message below the card footer

---

## Settings Page — League Details Tab

### Tab ordering

`League Details` is the **first** tab in the settings page, before Members and Features.

### Card structure

Matches the existing settings card pattern (`rounded-lg bg-slate-800 border border-slate-700 overflow-hidden`):

```
┌─────────────────────────────────────────┐
│ League Details                          │  ← card header: text-sm font-medium text-slate-200
│ Shown between the league title and      │  ← subtitle: text-xs text-slate-500
│ tabs on all league pages.               │
├─────────────────────────────────────────┤
│ ┌─ PREVIEW ───────────────────────────┐ │
│ │ 📍 Hackney Marshes · 🕖 Thursdays   │ │  ← bg-slate-900 inset strip, labelled "PREVIEW"
│ │ · 6:30pm · 👥 14 players            │ │     in text-xs uppercase text-slate-600
│ │ A 6-a-side league for the…          │ │     reflects saved values only (not live)
│ └─────────────────────────────────────┘ │
│                                         │
│ LOCATION                                │
│ [_______________________________]       │
│                                         │
│ DAY                KICK-OFF TIME        │
│ [Thursday ▾]       [6:30pm ▾]          │
│                                         │
│ PLAYERS IN LEAGUE                       │
│ 14 players  [auto]                      │
│ Counted from the Players tab…           │
│                                         │
│ ─────────────────────────────────────── │
│                                         │
│ BIO                                     │
│ [                                    ]  │
│ [                                    ]  │
│ Keep it short — one or two sentences…   │
│                                         │
├─────────────────────────────────────────┤
│ [         Save changes               ]  │  ← full-width button in card footer
└─────────────────────────────────────────┘
```

### Preview strip

- Sits at the top of the card body, above the form fields
- Shows a static render of how the info bar will look on the league page
- Reflects **saved** values only — not live as the user types
- Uses `bg-slate-900 border border-slate-800 rounded-md` inset styling
- Labelled "PREVIEW" in `text-xs uppercase tracking-wide text-slate-600`
- Applies the same display-time transforms as the real info bar (pluralised day, dot-separated)

---

## Out of Scope

- Live/real-time preview that updates as the user types (preview reflects saved values)
- Partial saves (all four fields sent together on save)
- New league setup flow (details added post-creation via settings for now)
- Player profile pages
- Kick-off times outside 5:00pm–9:00pm range
