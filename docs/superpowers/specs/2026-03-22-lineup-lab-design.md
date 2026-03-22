# The Lineup Lab — Design Spec

**Date:** 2026-03-22
**Status:** Approved

---

## Overview

Add a third tab to the league page called **The Lineup Lab** — a scratchpad for picking players and experimenting with team splits. It is explicitly not for building matchday teams. Nothing written here is saved to the database.

---

## Access

- Gated behind the existing `team_builder` feature flag.
- Visible to **members and above** when the flag is enabled. Admins always see it regardless.
- No new feature flag required.

---

## Route & page

**Route:** `/app/league/[id]/lineup-lab`

- Server component (`page.tsx`) — fetches the league's player list and feature flags, enforces access control, and passes data down to the client component.
- If the feature is not enabled for the user's tier, redirect to the league results page (consistent with how other gated routes behave).

---

## Layout (top to bottom)

### 1. Intro card

A fixed card at the top of the page. Contains:
- Icon: ⚽
- Title: **"The Lineup Lab"**
- Body: *"Pick players, drag them around, see how the teams balance out. Nothing here affects the actual match."*

### 2. Action row

Two controls in a single row, space-between:
- **Left:** `⚖️ Auto-Balance Teams` button — runs the balance algorithm on the current selection.
- **Right:** `↺ Clear all` button — resets both teams and returns all chips to unselected. Styled as a subtle text button (not a primary action).

Both buttons are disabled / hidden when no players are selected.

### 3. Teams grid

Two columns: **Team A** (sky colour) and **Team B** (violet colour).

Each column has:
- Header row: team label (`Team A` / `Team B`) + live score badge (`ewptScore().toFixed(3)` format).
- Player rows — draggable, showing player name and last-5 form dots (`recentForm`). Goalkeeper players show the 🧤 emoji after their name.
- An empty drop-zone placeholder shown when the team has no players.

The grid is hidden until at least one player is selected (replaced by a subtle prompt: *"Select players below to get started."*)

### 4. Balance bar

Displayed below the teams grid. Shows:
- Win probability percentages for Team A and Team B (`winProbability()` from `lib/utils`).
- A segmented bar: sky-600 (Team A) and violet-600 (Team B), proportional to win probability.
- Commentary line beneath (`winCopy()` from `lib/utils`).

Hidden until at least 2 players are in play (one per team minimum).

### 5. Divider

A visual separator between the teams/balance section and the player pool.

### 6. Player pool

- Label: **"All players — tap to add"**
- All league players rendered as pill chips, sorted alphabetically.
- **Grey chip** = not selected.
- **Blue-tinted chip** = assigned to Team A.
- **Purple-tinted chip** = assigned to Team B.
- Hint text below: *"Coloured = in a team · tap a coloured chip to remove"*

---

## Interaction model

### Adding a player
Tap a grey chip → the player is assigned to whichever team currently has fewer players. On a tie, Team A receives the player. The chip changes colour to reflect their team.

### Removing a player
Tap a blue or purple chip → the player is removed from their team and returns to grey. Both teams update immediately.

### Drag and drop
Player rows within the teams grid are draggable. The implementation mirrors the existing drag-and-drop in `NextMatchCard` exactly:
- HTML5 drag events: `draggable`, `onDragStart`, `onDragOver`, `onDragLeave`, `onDrop`, `onDragEnd`.
- A `dragSource` ref tracks the drag origin `{ team: 'A' | 'B', index: number }`.
- A `dragOver` state drives the drop-target highlight.
- `handleSwap` swaps the dragged player with the drop target, including cross-team swaps.
- Drop highlight colours match the team: sky for A, violet for B.

### Auto-Balance
Clicking Auto-Balance runs `autoPick()` from `lib/autoPick` on the currently selected players (union of both teams). Takes `suggestions[0]` (most balanced result). Replaces `teamA` and `teamB` state with the suggestion's teams. No suggestion carousel — this is a scratchpad, not the match flow.

If fewer than 2 players are selected, the button is disabled.

### Clear all
Resets `teamA` and `teamB` to empty arrays. All chips return to grey. The teams grid reverts to the "select players to get started" empty state.

---

## Styling

All styling replicates the existing team builder in `NextMatchCard` exactly:

| Element | Classes |
|---|---|
| Player row (A) | `bg-sky-950/40 border-sky-900/60` · hover/drag-over: `bg-sky-800/60 border-sky-600` |
| Player row (B) | `bg-violet-950/40 border-violet-900/60` · hover/drag-over: `bg-violet-800/60 border-violet-600` |
| Player name (A) | `text-sky-100` |
| Player name (B) | `text-violet-100` |
| Score badge (A) | `bg-sky-900/60 border border-sky-700 text-sky-300` |
| Score badge (B) | `bg-violet-900/60 border border-violet-700 text-violet-300` |
| Form dots | Reuse `FormDots` component from `NextMatchCard` |
| Balance bar A | `bg-sky-600` |
| Balance bar B | `bg-violet-600` |

The `FormDots` component and `FORM_COLOR` map should be extracted from `NextMatchCard.tsx` into a shared location (e.g. `components/FormDots.tsx`) so both components can import it without duplication.

---

## State & persistence

- `LineupLab` is a client component.
- State: `teamA: Player[]` and `teamB: Player[]` via `useState`.
- Persists for the duration of the browser session (survives tab switches within the app).
- Resets on full page refresh — intentional, matches the scratchpad nature.
- No Supabase reads or writes from this component.

---

## Component structure

| File | Role |
|---|---|
| `app/app/league/[id]/lineup-lab/page.tsx` | Server component. Fetches players + features. Enforces access. Passes `allPlayers` to `LineupLab`. |
| `components/LineupLab.tsx` | Client component. All interactive state. Renders intro, actions, teams, balance bar, and player pool. |
| `components/FormDots.tsx` | Extracted from `NextMatchCard.tsx`. Shared by both components. |

---

## Out of scope

- No ability to add guests or new players.
- No saving or sharing of lineups.
- No multiple suggestions / carousel (unlike the match flow).
- No match format display (`n-a-side`) — not relevant without a scheduled match context.
