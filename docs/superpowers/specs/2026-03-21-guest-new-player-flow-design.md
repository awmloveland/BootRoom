# Guest & New Player Flow — Design Spec

**Date:** 2026-03-21
**Status:** Approved for implementation

---

## Overview

Replace the existing free-text guest input in the team builder lineup stage with a structured "Add guest or new player" button and modal flow. Extend the game result flow to prompt rating reviews and optional roster promotion for any guests or new players who played.

---

## Context

Currently, guests are added as raw strings via a text input in the lineup builder. They receive the median league rating, have no team-pinning constraint, and are never persisted beyond the week's `team_a`/`team_b` arrays.

The new flow introduces two structured player types — **Guest** and **New Player** — with metadata (association, rating) stored in a new `lineup_metadata` JSONB column on the `weeks` table. This ensures the data survives across sessions (lineup built Tuesday, resulted Friday).

---

## Scope

This spec covers:
1. The "Add guest or new player" button and modal (lineup builder)
2. Guest flow — associate to a player, set eye test rating, auto-name as "Alice +1"
3. New player flow — enter name, set eye test rating (1–3 slider)
4. `lineup_metadata` storage in the `weeks` table
5. Auto-pick team constraint for guests (pinned to associated player's team)
6. 3-step result modal — pick winner → review guests/new players → confirm & save
7. Roster promotion — new players and converted guests added to `player_attributes`
8. Lineup edit flow — reconstruct guest/new-player state from `lineup_metadata` on re-edit

This spec does **not** cover:
- Player profile pages
- Public-mode roster promotion (public result route is unchanged; roster promotion is members/admin only)

---

## Access Control

Any league member with access to the team builder can add guests or new players. Admins can also do so. No special permissions required beyond existing team builder access.

---

## 1. Lineup Builder Changes

### 1.1 Button replaces text input

Remove the "Add a guest player" free-text input. Replace with an "Add guest or new player" button rendered as a dashed-border pill alongside the selected player pills:

```
[ Alice × ] [ Bob × ] [ + Add guest or new player ]
```

### 1.2 Add Player modal — Step 1: Choose type

A modal opens with two options:

| Option | Icon | Description |
|---|---|---|
| Guest | 👤 | A +1 for an existing player |
| New player | ✨ | Add them to the roster |

Selecting one advances to Step 2.

### 1.3 Guest flow (Step 2a)

Fields:
- **Plays with** — dropdown of current lineup players (required)
- **The Eye Test** — 1–3 slider, defaults to the average rating of all known players

**Auto-name:** the guest's display name is derived as `"[Associated Player] +1"`. If a guest for that player already exists in the current session, increment the suffix: "Alice +1", "Alice +2", etc. The incrementing is done client-side by scanning the existing guest entries in state. No manual name field is shown.

**Guests always have `goalkeeper: false` and `mentality: 'balanced'`.** They are never assigned a goalkeeper role, ensuring the auto-pick GK constraint is never affected by guest placement.

**Warning state:** If the associated player is not in the current lineup (only possible if the player was deselected after adding the guest), show an amber warning banner:
> "⚠ [Name] isn't in the current lineup. The guest will be added but can't be pinned to a team until [Name] is selected."
The user can still confirm ("Add anyway").

**Reassurance copy** (below slider):
> "This isn't personal. It's just a starting point to help balance teams. Ratings aren't visible to players and will naturally adjust over time based on their form."

### 1.4 New player flow (Step 2b)

Fields:
- **Player name** — text input (required)
- **The Eye Test** — 1–3 slider, defaults to the average rating of all known players

**Name collision check:** before confirming, check the entered name (case-insensitive) against the `allPlayers` list passed into `AddPlayerModal`. If a match exists, show an inline error: "A player named [X] already exists in this league." Block the confirm button.

**Reassurance copy** (below slider):
> "This isn't personal. It's just a starting point to help balance teams. Ratings aren't visible to players and will naturally adjust over time based on their form."

Note below form:
> "They'll be added to the league roster permanently after confirming during result."

### 1.5 Pill display

After adding:
- Guests render as a dashed-border pill labelled "Alice +1"
- New players render as a solid pill with their name
- Both are removable with a ×

### 1.6 Lineup edit flow

When a user edits a saved lineup (via `handleEditLineup`), the current code reconstructs `selectedNames` from `team_a + team_b`. After this change it must reconstruct state as follows:

- **`selectedNames`** — set to only the names from `team_a + team_b` that exist in `allPlayers` (i.e. known league players). Guest names ("Alice +1") and new player names will be present in the arrays but must be excluded from `selectedNames` since they do not correspond to entries in the player list UI.
- **`guestEntries`** — populated from `lineup_metadata.guests` (deserialised with `type: 'guest'` added)
- **`newPlayerEntries`** — populated from `lineup_metadata.new_players` (deserialised with `type: 'new_player'` added)

The combined squad passed to auto-pick is `selectedNames + guestEntries.map(g => g.name) + newPlayerEntries.map(p => p.name)`, same as during initial lineup building.

If `lineup_metadata` is null/absent on the week row, `guestEntries` and `newPlayerEntries` default to `[]` and the edit flow behaves as today.

---

## 2. Data Model

### 2.1 `lineup_metadata` column

Add a `lineup_metadata` JSONB column to the `weeks` table. It is written alongside `team_a`/`team_b` when a lineup is saved.

**Stored JSONB shape:**

```jsonb
{
  "guests": [
    {
      "name": "Alice +1",
      "associated_player": "Alice",
      "rating": 2
    }
  ],
  "new_players": [
    {
      "name": "Jordan",
      "rating": 3
    }
  ]
}
```

Note: stored objects do not include a `type` discriminant field. The `type` field on `GuestEntry` / `NewPlayerEntry` TypeScript types is a runtime-only discriminant, not persisted.

**Deserialisation:** In `NextMatchCard.tsx`, the existing manual mapping block that converts snake_case DB columns to camelCase (e.g. `team_a` → `teamA`) must also map `lineup_metadata`:

```ts
lineupMetadata: raw.lineup_metadata
  ? {
      guests: (raw.lineup_metadata.guests ?? []).map((g: any) => ({
        type: 'guest' as const,
        name: g.name,
        associatedPlayer: g.associated_player,
        rating: g.rating,
      })),
      new_players: (raw.lineup_metadata.new_players ?? []).map((p: any) => ({
        type: 'new_player' as const,
        name: p.name,
        rating: p.rating,
      })),
    }
  : null,
```

### 2.2 `ScheduledWeek` type update

`ScheduledWeek` in `lib/types.ts` gains an optional field:

```ts
lineupMetadata?: LineupMetadata | null
```

The Supabase select query in `NextMatchCard.tsx` that fetches the scheduled week must be extended to include `lineup_metadata` alongside `id, week, date, format, team_a, team_b, status`.

### 2.3 Migration

```sql
ALTER TABLE weeks ADD COLUMN lineup_metadata jsonb DEFAULT NULL;
```

Update the `save_lineup` RPC to accept and store `p_lineup_metadata jsonb`.

Add a new `SECURITY DEFINER` RPC `promote_roster` to handle the `player_attributes` upserts at result time, since the existing RLS policy restricts writes to admins only:

```sql
CREATE OR REPLACE FUNCTION promote_roster(
  p_game_id uuid,
  p_entries jsonb   -- array of {name, rating} objects
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Verify caller can do match entry (admin or member with match_entry enabled)
  IF NOT can_do_match_entry(p_game_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  INSERT INTO player_attributes (game_id, name, rating, mentality, goalkeeper)
  SELECT p_game_id, e->>'name', (e->>'rating')::int, 'balanced', false
  FROM jsonb_array_elements(p_entries) AS e
  ON CONFLICT (game_id, name) DO UPDATE
    SET rating = EXCLUDED.rating;
END;
$$;
```

`promote_roster` is called from `handleSaveResult` (member mode only) after the result is recorded. Public mode never calls it.

---

## 3. Auto-Pick Behaviour

### 3.1 Guest team constraint

Guests with an associated player who is also in the squad must be placed on the same team as that associated player. This is enforced as a **post-process step** after the auto-pick algorithm generates its best balanced split:

1. For each guest with a valid associated player in the squad, check whether they are on the same team.
2. If not, swap the guest to the associated player's team by moving the last-added unassigned player from the other team to fill the gap. If no clean swap exists, swap the guest directly (accepting a minor balance impact).
3. No further balance re-scoring is run after the swap — the swap is applied as a hard constraint override. The displayed win probability bar will reflect the final (post-swap) team compositions.
4. If the associated player is not in the squad (warning state accepted), the guest is placed freely with no pinning.

**GK safety:** Guests always have `goalkeeper: false`. The post-process swap therefore never moves a goalkeeper, so the GK constraint (one GK per team) cannot be broken by guest pinning.

### 3.2 New player rating

New players are resolved using the rating stored in `lineup_metadata.new_players[*].rating` rather than the median of all players. Their stats (played, won, etc.) are zeroed as with current guest handling.

---

## 4. Result Flow

The existing single-step result dialog becomes a **3-step modal** when guests or new players are present in `lineup_metadata`. If neither are present, the flow is unchanged (Step 2 and Step 3 are skipped; result saves on step 1 confirm).

### Step 1 — Pick winner (unchanged)

- Team A / Draw / Team B buttons
- Optional notes textarea
- Step indicator shows progress (e.g. "1 of 3")
- "Next →" advances to Step 2 (or saves directly if no guests/new players)

### Step 2 — The Eye Test review

Shown once for all guests and new players combined.

Each player gets a card with:
- Name + type badge (Guest / New player)
- "The Eye Test" 1–3 slider pre-filled with their `lineup_metadata` rating

**For guests only**, each card also has:
- A toggle: **"Add to the roster — they're joining the league"** (default: off)
- When toggled on: a name input appears pre-focused ("Enter their name…")
- **Name collision check:** on confirm, check the entered name (case-insensitive) against `allPlayers`. If a match exists, show an inline error and block the confirm.

This step is **required** — there is no skip option.

### Step 3 — Confirm & save

Summary view showing:
- Winner
- Each new player being added to the roster with their final rating
- Each guest being converted to a player (toggle on) with their entered name and rating
- Guests not being converted are listed as "played as guest only"

"Save result" (green) commits atomically:
1. Updates `weeks` row: `status='played'`, `winner`, `notes`
2. For each new player: upserts `player_attributes` (`game_id`, `name`, `rating`, `mentality='balanced'`, `goalkeeper=false`)
3. For each guest with toggle on: same upsert using the entered name

**Roster promotion RLS:** `player_attributes` writes are gated by an admin-only RLS policy. Roster promotion therefore calls the `promote_roster` SECURITY DEFINER RPC (see section 2.3) rather than upsert directly from the client.

**Public mode:** The public result API route (`/api/public/league/[id]/result`) is unchanged. Roster promotion (step 2/3) only runs in member/admin mode. In public mode the result flow remains the current single-step dialog with no guest/new-player review. The public lineup API route (`/api/public/league/[id]/lineup`) always writes `lineup_metadata: null` — public lineup saves do not support guest/new-player metadata.

---

## 5. Component Architecture

| Component | Purpose |
|---|---|
| `AddPlayerModal.tsx` | New component — the full add-player modal (step 1 type selection + step 2a/2b sub-flows). Props: `players: Player[]`, `onAdd: (entry: GuestEntry | NewPlayerEntry) => void`, `onClose: () => void` |
| `ResultModal.tsx` | Extracted from inline JSX in `NextMatchCard.tsx` — handles the 3-step result flow. Props: `scheduledWeek: ScheduledWeek`, `lineupMetadata: LineupMetadata | null`, `allPlayers: Player[]`, `gameId: string`, `publicMode: boolean`, `onSaved: () => void`, `onClose: () => void` |
| `EyeTestSlider.tsx` | Small shared component — the 1–3 slider with labels and optional reassurance note. Props: `value: number`, `onChange: (v: number) => void`, `showNote?: boolean` |

`NextMatchCard.tsx` currently contains the result dialog as inline JSX (~80 lines). Extracting it to `ResultModal.tsx` is required to support the multi-step flow without bloating the parent. `ResultModal` receives `allPlayers` so it can perform name collision checks for guest-to-player conversion at result time.

---

## 6. Types

Add to `lib/types.ts`:

```ts
export interface GuestEntry {
  type: 'guest'               // runtime discriminant only, not persisted
  name: string                // e.g. "Alice +1"
  associatedPlayer: string    // e.g. "Alice"
  rating: number              // 1–3
}

export interface NewPlayerEntry {
  type: 'new_player'          // runtime discriminant only, not persisted
  name: string
  rating: number              // 1–3
}

export interface LineupMetadata {
  guests: GuestEntry[]
  new_players: NewPlayerEntry[]
}
```

Update `ScheduledWeek`:

```ts
export interface ScheduledWeek {
  // ... existing fields ...
  lineupMetadata?: LineupMetadata | null
}
```

---

## 7. Edge Cases

| Scenario | Behaviour |
|---|---|
| Associated player deselected after guest added | Warning banner shown on guest pill; guest placed freely in auto-pick |
| Two guests for the same player | Allowed. Names increment: "Alice +1", "Alice +2". Counter derived by scanning existing guest entries in state. |
| New player name collision with existing player (at add time) | Inline error in `AddPlayerModal`: "A player named [X] already exists." Confirm blocked. |
| Guest converted to player with colliding name (at result time) | Inline error in `ResultModal` on confirm: "A player named [X] already exists." Confirm blocked. |
| Result flow with no guests/new players | Steps 2 and 3 skipped; result saves on step 1 confirm (unchanged behaviour) |
| Page refresh after lineup saved | `lineup_metadata` loaded from `weeks` row via extended select; `ScheduledWeek.lineupMetadata` populated |
| Editing a saved lineup | `handleEditLineup` reconstructs guest/new-player entries from `lineupMetadata` on the week row |
| `lineup_metadata` is null on an existing week row | Treated as empty (`guests: [], new_players: []`); backwards compatible |
| Public mode result | Steps 2/3 skipped regardless of lineup contents; existing single-step dialog unchanged |
| Guest has `goalkeeper: true` | Impossible by design — guests are always created with `goalkeeper: false` |
