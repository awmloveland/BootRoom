# Display Name Removal + Admin Player Rename

**Date:** 2026-04-09
**Status:** Approved

---

## Problem

Updating `display_name` in account settings does not propagate to player names in lineups, league tables, or the team builder. The `display_name` field carries misleading helper text ("How you appear in lineups and player lists") but only updates `profiles.display_name`, which is used for the navbar avatar — not for match data.

Player names in match data (`weeks.team_a`/`team_b`, `player_attributes`, `player_claims`) are plain strings set by admins when recording results. These are entirely separate from the profile system, making a user-driven cascade complex and error-prone.

## Decision

- Remove `display_name` from the account settings UI entirely. Avatar initials are derived from `first_name` + `last_name`, which already work with the existing `getInitials` utility.
- Admins are the sole authority for renaming players. A rename cascades atomically through all match data for that league.

---

## Changes

### 1. Account settings — remove display_name field

**`app/settings/page.tsx`**
- Remove the display name `<input>` and its helper text
- Remove `displayName` / `setDisplayName` state
- Remove `display_name` from the `saveProfile` PATCH body

**`app/api/auth/profile/route.ts`**
- Remove `display_name` from accepted PATCH fields
- Remove the auto-derive logic (`first_name + last_name → display_name`) — first/last name saves are now the only operation

**`app/api/auth/me/route.ts`**
- Change the profiles `select` from `display_name` to `first_name, last_name`
- Return `{ first_name, last_name }` in the profile payload instead of `{ display_name }`

**`components/ui/navbar.tsx`**
- Derive the name string as `` `${data?.profile?.first_name ?? ''} ${data?.profile?.last_name ?? ''}`.trim() `` — falls back to `user.email` if both are empty
- Pass this to `AvatarButton` as `name` — `getInitials` already handles "First Last" → "FL"

---

### 2. Admin player rename — PlayerRosterPanel

**UI: `components/PlayerRosterPanel.tsx`**
- Add a ✎ icon (`Pencil` from `lucide-react`) next to each player name in the row
- State: `renamingPlayer: string | null` (name of the player currently being renamed), `renameValue: string`, `renameError: string | null`, `renameSubmitting: boolean`
- Only one rename open at a time — opening a new one closes any existing one
- While rename is open: row dims (`opacity-60`), ✎ icon hidden
- Rename panel expands inline below the row (same pattern as the member link picker)
- On save: calls `PATCH /api/league/[id]/players/[name]/rename` with `{ new_name }`
- On success: update local player list (replace old name with new name in state), close panel
- On conflict error: show inline "Name already exists in this league"
- Cancel: closes panel, resets state

**API: `app/api/league/[id]/players/[name]/rename/route.ts`** (new file)
- `PATCH` handler — admin only (check `is_game_admin`)
- Accepts `{ new_name: string }` — validates present and non-empty after trim
- Calls RPC `admin_rename_player(p_game_id, p_old_name, p_new_name)`
- Maps RPC error `name_already_exists` → 409 with `{ error: 'Name already exists in this league' }`

**Migration: `admin_rename_player` RPC**

```sql
CREATE OR REPLACE FUNCTION public.admin_rename_player(
  p_game_id  uuid,
  p_old_name text,
  p_new_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin gate
  IF NOT is_game_admin(p_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Validate new name is different
  IF p_old_name = p_new_name THEN
    RETURN;
  END IF;

  -- Conflict check: new name already exists in player_attributes for this league
  IF EXISTS (
    SELECT 1 FROM player_attributes
    WHERE game_id = p_game_id AND name = p_new_name
  ) THEN
    RAISE EXCEPTION 'name_already_exists';
  END IF;

  -- Update player_attributes
  UPDATE player_attributes
  SET name = p_new_name
  WHERE game_id = p_game_id AND name = p_old_name;

  -- Update player_claims (player_name and admin_override_name)
  UPDATE player_claims
  SET player_name = p_new_name
  WHERE game_id = p_game_id AND player_name = p_old_name;

  UPDATE player_claims
  SET admin_override_name = p_new_name
  WHERE game_id = p_game_id AND admin_override_name = p_old_name;

  -- Update weeks.team_a and team_b JSONB arrays
  -- Replaces all occurrences of old_name with new_name in both arrays
  UPDATE weeks
  SET
    team_a = (
      SELECT jsonb_agg(CASE WHEN val = p_old_name THEN p_new_name ELSE val END)
      FROM jsonb_array_elements_text(team_a) AS val
    ),
    team_b = (
      SELECT jsonb_agg(CASE WHEN val = p_old_name THEN p_new_name ELSE val END)
      FROM jsonb_array_elements_text(team_b) AS val
    )
  WHERE game_id = p_game_id
    AND (team_a @> to_jsonb(p_old_name) OR team_b @> to_jsonb(p_old_name));

END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_rename_player(uuid, text, text) TO authenticated;
```

---

## Scope boundaries

- No change to the Members tab in league settings
- No change to `player_claims` status or the assign/link flow
- No change to `get_player_stats` RPC — it reads from `weeks` and `player_attributes` which are updated by the rename
- The `display_name` column remains in the `profiles` table (used by admin views, member lists) — only the user-facing edit field is removed
- The welcome flow (`app/welcome/`) derives `display_name` from first+last name on first save — this auto-derive logic in the profile route should be preserved for that path only, or the welcome flow should be updated separately

## Welcome flow

The profile route currently auto-derives `display_name` from `first_name + last_name` when the welcome flow saves. The welcome page itself does not reference `display_name` — so the auto-derive logic can be removed from the route with no side effects.
