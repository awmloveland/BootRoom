# Players Tab — Link Member Design

**Date:** 2026-04-05
**Status:** Approved

## Overview

Admins can currently link a member to a player from the Members tab in league settings. This feature adds the mirror capability: from the Players tab, an admin can see which member is linked to each player and link an unlinked player to a member — using the same inline picker UX already established on the Members tab.

---

## Data Layer

### `PlayerAttribute` type (`lib/types.ts`)

Add two optional fields:

```ts
export interface PlayerAttribute {
  name: string
  rating: number        // 1–3
  mentality: Mentality
  linked_user_id?: string | null
  linked_display_name?: string | null
}
```

### Players API (`GET /api/league/[id]/players`)

Extend the Supabase query to left-join `game_members` on `game_members.linked_player_name = player_attributes.name` (scoped to the same `game_id`), returning the linked member's `user_id` and `display_name` (falling back to `email` if `display_name` is null) alongside the existing `name, rating, mentality`.

No new API routes. The assign endpoint (`POST /api/league/[id]/player-claims/assign`) is reused unchanged — it already accepts `{ user_id, player_name }`.

---

## New Component: `MemberLinkPicker`

**File:** `components/MemberLinkPicker.tsx`

Mirrors `PlayerClaimPicker` in structure and styling.

- Fetches `GET /api/league/[id]/members` on mount
- Filters to members where `linked_player_name` is `null`
- Renders a search input + scrollable list of unlinked member names (display name, falling back to email)
- Clicking a name calls `onLink(userId, displayName)` immediately (no separate submit button — equivalent to `selectionOnly` mode)
- Shows a Cancel button
- Footer text: `"Only members without a linked player are shown."`
- Panel styling: `border-t border-slate-700 p-4 bg-slate-900/40` (matches `PlayerClaimPicker`)

Props:
```ts
interface Props {
  leagueId: string
  onLink: (userId: string, displayName: string) => void
  onCancel: () => void
  submitting?: boolean
}
```

---

## `PlayerRosterPanel` Updates

### State

Add one new state variable:

```ts
const [linkingPlayerName, setLinkingPlayerName] = useState<string | null>(null)
const [linkError, setLinkError] = useState<string | null>(null)
const [linkSubmitting, setLinkSubmitting] = useState(false)
```

### Per-row UI

In each player row (next to the existing eye-test / mentality controls):

- **Linked:** show emerald badge — `Linked: {linked_display_name}` (same styling as members tab)
- **Unlinked:** show dashed `+ Link member` button (same styling as members tab's `+ Link player` button)

### Inline picker

When `linkingPlayerName === player.name`, render `<MemberLinkPicker>` below the row (same inline expansion pattern as `AdminMemberTable`).

On confirm (`onLink`):
1. Set `linkSubmitting = true`
2. Call `POST /api/league/[id]/player-claims/assign` with `{ user_id, player_name: player.name }`
3. On success: optimistically update `players` state to set `linked_display_name` on the matching player, close the picker
4. On error: show `linkError` below the picker row
5. Set `linkSubmitting = false`

---

## Placement of the Link Badge / Button

On desktop (sm+), the linked badge / link button is placed between the player name and the eye-test controls — mirroring where it sits in `AdminMemberTable` rows.

On mobile, the badge is shown in the collapsed row summary. The `+ Link member` button appears in the expanded mobile section (below eye-test and mentality), so it doesn't crowd the collapsed row.

---

## Out of Scope

- Unlinking a player from this view (not supported on the members tab either — consistent)
- Showing the linked player on the members tab changes (no change there)
- Any DB migration — the schema already supports this via `game_members.linked_player_name`
