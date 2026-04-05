# Design: Fix member tab player link display

**Date:** 2026-04-05
**Branch:** `awmloveland/fix-member-tab-player-link-display`

---

## Problem

When an admin links a member to a player on the Members tab in Settings, the "Linked: PlayerName" badge never appears — the row always shows "+ Link player". The linked state is visible in the user's own Account Settings page, confirming the data is correctly written to the DB. The display failure is entirely a read-path problem.

### Root cause

`get_player_claims` does a `LEFT JOIN auth.users au ON au.id = pc.user_id` to fetch email. The `auth` schema has restricted access in Supabase and this join fails, causing the `/api/league/[id]/player-claims/all` route to return a non-OK response. `loadMembers` silently swallows non-OK responses (`claimsRes.ok ? claimsRes.json() : Promise.resolve([])`), so `claimsData` is always `[]`, `claimsMap` is always `{}`, and every member row shows "+ Link player".

### Why this wasn't caught earlier

Every other RPC in the codebase (`get_league_members`) reads email from the `profiles` table, which has an `email` column. `get_player_claims` is the only RPC that reaches into `auth.users` directly. The silent fallback in `loadMembers` masked the error.

---

## Design

### Principle

A member's linked player name is part of their member data. It should arrive with the members query — not as a separate fetch that requires a second state variable (`claimsMap`) to correlate back. Eliminating the split removes the broken code path entirely and simplifies the data model.

### Changes

#### 1. DB migration — extend `get_league_members` + fix `get_player_claims`

**`get_league_members`**: Drop and recreate to add `linked_player_name text` to the `RETURNS TABLE`. Add a `LEFT JOIN` to `player_claims` filtered to `status = 'approved'`. The effective name is `COALESCE(pc.admin_override_name, pc.player_name)` — this correctly handles both admin-direct assignments (where `admin_override_name` is NULL) and admin-reviewed member claims (where an override name may be set).

```sql
DROP FUNCTION IF EXISTS public.get_league_members(uuid);

CREATE FUNCTION public.get_league_members(p_game_id uuid)
RETURNS TABLE (
  user_id           uuid,
  email             text,
  display_name      text,
  role              text,
  joined_at         timestamptz,
  linked_player_name text          -- new: NULL if no approved claim
)
...
FROM game_members gm
JOIN profiles p ON p.id = gm.user_id
LEFT JOIN player_claims pc
  ON pc.game_id = p_game_id
  AND pc.user_id = gm.user_id
  AND pc.status = 'approved'
WHERE gm.game_id = p_game_id
  AND is_game_admin(p_game_id)
ORDER BY gm.joined_at ASC;
```

**`get_player_claims`**: Replace `LEFT JOIN auth.users au` + `au.email` with `profiles.email` (already joined as `pr`). Drop the `auth.users` join entirely. No return-type change needed so `CREATE OR REPLACE` is fine.

Re-grant `EXECUTE` on both functions to `authenticated`.

#### 2. `lib/types.ts` — extend `LeagueMember`

```ts
export interface LeagueMember {
  user_id: string
  email: string
  display_name: string | null
  role: GameRole
  joined_at: string
  linked_player_name: string | null   // new
}
```

#### 3. `app/[leagueId]/settings/page.tsx`

- Remove `claimsMap` state (`useState<Record<string, string>>({})`).
- Remove `setClaimsMap` calls in `loadMembers`.
- Remove the `claimsMap` prop from `<AdminMemberTable>`.
- Keep the `/player-claims/all` fetch and `pendingClaims` state — still needed for `PlayerClaimsTable`.

#### 4. `components/AdminMemberTable.tsx`

- Remove `claimsMap` from `AdminMemberTableProps`.
- Replace `const linkedName = claimsMap[member.user_id]` with `const linkedName = member.linked_player_name`.
- No other logic changes.

---

## Data flow after fix

```
loadMembers()
  ├── GET /api/league/[id]/members         → get_league_members RPC
  │     returns members[] each with linked_player_name
  │
  ├── GET /api/league/[id]/join-requests   → pending join requests
  │
  └── GET /api/league/[id]/player-claims/all → get_player_claims RPC (now fixed)
        used only for pendingClaims → PlayerClaimsTable
        claimsMap is gone
```

`AdminMemberTable` renders `member.linked_player_name` directly. No correlation step, no separate state, no silent failure mode.

---

## What is NOT changing

- `assign_player_link` RPC — unchanged, still creates approved claims correctly.
- `PlayerClaimsTable` — unchanged, still receives `pendingClaims` as before.
- `PlayerClaimPicker` — unchanged.
- The `/api/league/[id]/player-claims/assign` route — unchanged.
- After `assignPlayer` succeeds, `onChanged()` → `loadMembers()` re-fetches members, and the new `linked_player_name` field will be populated. The real-time update path works automatically.

---

## Migration file

`supabase/migrations/20260405000001_member_linked_player_name.sql`

---

## Files to change

| File | Change |
|---|---|
| `supabase/migrations/20260405000001_member_linked_player_name.sql` | New migration |
| `lib/types.ts` | Add `linked_player_name` to `LeagueMember` |
| `app/[leagueId]/settings/page.tsx` | Remove `claimsMap` state + prop |
| `components/AdminMemberTable.tsx` | Use `member.linked_player_name`, remove `claimsMap` prop |
