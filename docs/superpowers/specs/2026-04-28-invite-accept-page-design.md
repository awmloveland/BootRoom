# Invite Accept Page — Design

**Date:** 2026-04-28
**Status:** Approved, ready for implementation plan

## Problem

The invite-token system is half-built. Admins can generate share links via `POST /api/invites`, the link points to `/invite?token=...`, and the database has a working `accept_game_invite()` RPC. But `app/invite/` does not exist — there is no page to consume the token. Users who click an invite link get a 404 and never become league members.

`CLAUDE.md` lists `app/app/invite/` in the repo structure, but the directory was never created and the path is wrong (other top-level pages like `welcome/`, `settings/`, `auth/` live directly under `app/`, not `app/app/`).

A real user (Fowwaz Ansari, `007f7b0e-c703-4c25-b3ec-1dcb5eda2190`) hit this on 2026-04-13: account created, `profiles` row created via `claim_profile()`, but zero `game_members` rows. Two open share invites for "Craft Football" (one `member`, one `admin`) were active at the time and remain so.

## Goal

Build the missing `/invite` page so any future user clicking a valid invite link is added to the correct league with the correct role and lands on the league's results page. As a one-off, manually add Fowwaz to the league as a member.

## Non-goals

- Telemetry on invite attempts (separate feature)
- Decline/dismiss UI
- Refactoring `AuthDialog`
- Cleanup of expired invites
- Changes to the `m.craft-football.com` redirect path
- Automated tests for the new page (codebase has no client-page test harness)

## Architecture

```
[admin clicks "Share link" in settings]
       ↓
[POST /api/invites]                              ← exists
       ↓
[returns: craft-football.com/invite?token=...]   ← exists
       ↓
[user clicks link]
       ↓
[/invite page]                                   ← NEW: app/invite/page.tsx
       ↓
[preview_invite(token) RPC]                      ← NEW: { league_name, league_slug, role, target_email | null }
       ↓
   signed in? ──no──→ [show context + AuthDialog with redirect=/invite?token=...]
       │                       ↓
       │                  [user signs in/up, comes back to /invite]
       ↓                       │
       └───── yes ←─────────────┘
                  ↓
       [accept_game_invite(token) RPC]           ← exists
                  ↓
              success? ──no──→ [show error per case]
                  ↓ yes
        [redirect to /<league_slug>/results]
```

Two new code artifacts (one client page + one SQL migration). All other pieces — invite generation, RPC for accepting, auth flow, redirect plumbing — already work.

## Components

### `app/invite/page.tsx` (new)

Client component. Reads `?token=` from URL search params. Renders one of these states:

| State | When | UI |
|---|---|---|
| `loading` | while `preview_invite` is in flight | Spinner + "Loading invite…" |
| `preview` | preview returned, user not signed in | Card: "You've been invited to join **{league_name}** as a **{role}**" + `<AuthDialog open redirect="/invite?token=..." leagueName="{league_name}" />` |
| `joining` | user is signed in, accepting | "Joining {league_name}…" splash |
| `error` | preview or accept failed | One of three error cards (see Error States) |

On mount:
1. Read `?token=` from search params. If missing or empty string → render `error` state ("invalid or expired") immediately, skip RPC calls.
2. Call `preview_invite(token)`.
3. If preview returns no rows → `error` state ("invalid or expired").
4. If signed in → call `accept_game_invite(token)` → on success redirect to `/<league_slug>/results`.
5. If not signed in → render `preview` state. After auth completes, the existing `redirect` chain (sign-in → `/welcome` → `redirect` URL) returns the user to `/invite?token=...`, where they re-enter step 1 already authenticated and fall into step 4.

Visual style follows the existing dark-mode-first conventions in `CLAUDE.md` (slate palette, `bg-slate-900`/`bg-slate-800`, no green/yellow/orange).

### `preview_invite` RPC (new migration)

New file: `supabase/migrations/20260428000001_preview_invite.sql` (next sequence after `20260427000002_dnf_preserve_ratings.sql`).

```sql
CREATE OR REPLACE FUNCTION public.preview_invite(invite_token text)
RETURNS TABLE (
  league_name text,
  league_slug text,
  role text,
  target_email text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.name, g.slug, gi.role,
         CASE WHEN gi.email = '*' THEN NULL ELSE gi.email END
  FROM game_invites gi
  JOIN games g ON g.id = gi.game_id
  WHERE gi.token = invite_token
    AND gi.expires_at > now()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.preview_invite(text) TO anon, authenticated;
```

`SECURITY DEFINER` bypasses the `game_invites` RLS that requires existing membership to read. Returns zero rows for invalid or expired tokens (no token-existence leak vs. expired-token leak — both look identical to the caller). Returns no `invited_by`, no `expires_at`, no `id` — only the data the page needs for context.

`anon` is granted execute so unauthenticated visitors can fetch league context before signing in.

## Data flow

Two RPCs touched per accept:
1. `preview_invite(token)` — read-only, returns league context. Called on every page load.
2. `accept_game_invite(token)` — existing, inserts into `game_members` and deletes the invite row (open invites are single-use per the existing migration `20260320000001_invite_role.sql`).

Already-a-member case: `accept_game_invite` has `ON CONFLICT (game_id, user_id) DO NOTHING`, so re-accepting silently succeeds. The page treats this as a normal success and redirects.

## Auth flow integration

No code changes needed in the auth components. The existing `redirect` param flows:

- `AuthDialog` accepts a `redirect` prop and forwards it through OTP verify and Google OAuth.
- `/auth/callback` reads `redirect` from search params and includes it in the post-callback redirect.
- `/welcome` reads `redirect` and forwards after name confirmation.

`<AuthDialog open redirect={`/invite?token=${token}`} leagueName={preview.league_name} />` re-enters `/invite?token=...` after auth completes.

## Error states

| Trigger | Message | Action |
|---|---|---|
| `preview_invite` returns no rows OR `accept_game_invite` raises `"Invalid or expired invite"` | "This invite link is no longer valid. It may have expired or been revoked. Ask the league admin for a fresh link." | Button: "Back to home" → `/` |
| `accept_game_invite` raises `"Invite was sent to a different email"` (preview returned a `target_email`) | "This invite was sent to **{target_email}**. You're signed in as **{current_email}**." | Button: "Sign out and try again" → `supabase.auth.signOut()` then `router.replace('/invite?token=...')` |
| `accept_game_invite` raises `"Not authenticated"` (session lost mid-flow edge case) | Falls back into `preview` state with AuthDialog open. | (existing flow) |

The `preview` payload carries `target_email`, so the mismatch case can be detected before calling `accept_game_invite` (compare `target_email` to `auth.email()` when both are present and `target_email` is non-null). Detecting client-side avoids a round-trip but isn't required for correctness — the RPC enforces the check server-side.

## Manual fix for Fowwaz

Run once in the Supabase SQL Editor, separate from the deploy:

```sql
INSERT INTO game_members (game_id, user_id, role)
SELECT g.id, '007f7b0e-c703-4c25-b3ec-1dcb5eda2190', 'member'
FROM games g
WHERE g.name = 'Craft Football'
ON CONFLICT (game_id, user_id) DO NOTHING;
```

## CLAUDE.md correction

`CLAUDE.md` currently says:

```
│   ├── app/                  # Authenticated member routes
│   │   ├── ...
│   │   ├── invite/           # Invite accept flow
```

This is wrong — the actual route is `/invite` (not `/app/invite`), so the page lives at `app/invite/page.tsx`, not `app/app/invite/`. Update the repo-structure block in `CLAUDE.md` to reflect the real location. Fold this doc fix into the same PR.

## Testing

Manual verification (no automated tests):

1. Open share link in incognito → AuthDialog appears with "Craft Football" as context → sign up via OTP or Google → after `/welcome`, redirected to `/invite?token=...` → auto-accept fires → land on `/<slug>/results`. Confirm a `game_members` row exists.
2. Open share link while signed in as a user already in the league → "Joining Craft Football…" briefly → land on `/<slug>/results`. No duplicate `game_members` row.
3. Tamper the token (e.g. `?token=garbage`) → "This invite link is no longer valid" card appears.
4. Create a targeted invite (`POST /api/invites` with a fake email) → click the link from a real account → mismatch error card with target email visible → "Sign out and try again" returns to `/invite?token=...` after sign-out.
5. Production smoke test: confirm the existing two open Craft Football share links still work end-to-end after deploy.
