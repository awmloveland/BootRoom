# Platform admin portal: design

**Date:** 2026-11-17
**Status:** Draft for review. Functional spec only; visual design follows on a localhost preview.

## Why

League creation is now self-serve (PRs #194 to #199). There is no way to see
which leagues exist, whether anyone uses them, or to remove one. This adds a
private portal for the site owner to do those three things.

## Decisions already made

| Question | Decision |
|---|---|
| Same app or separate app | Same app, under `/platform` |
| Who has access | The three accounts that held the old `developer` role: Will and two others |
| How access is granted | A list of user ids in a server-only environment variable |
| The old `developer` role | Removed. Nothing reads it and any user can assign it to themselves |
| Delete | Hard delete, with the league's rows saved to an audit log first |
| Feature flag | None. The admin gate is stricter than a flag |

## Findings this rests on (production, checked 2026-11-17)

- `profiles.role` exists (`user` or `developer`); three accounts hold
  `developer`. No code, policy or function refers to it.
- The "Users update own profile" policy has no column restriction and
  `authenticated` has UPDATE on `role`, so any signed-in user can set their own
  role to `developer` through the Supabase API. Confirmed from the live
  policies and grants, not by doing it.
- All ten tables that reference `games` use `ON DELETE CASCADE`:
  `game_members`, `game_invites`, `weeks`, `config`, `league_features`,
  `player_attributes`, `game_join_requests`, `player_claims`, `week_fees`,
  `week_payments`.
- No analytics package is installed, so page views are not available.

## Access

- `PLATFORM_ADMIN_IDS`: server-only environment variable, comma-separated
  Supabase user ids. It starts with three ids; the values live in Vercel and
  `.env.local`, not in the repository. User ids, not emails, because an id never changes hands.
  Missing or empty means nobody is an admin.
- `lib/platform.ts` exports `isPlatformAdmin(userId)`. It is the only
  place the variable is read.
- Every page under `app/platform/` gets the signed-in user on the server and
  calls `notFound()` unless `isPlatformAdmin` passes. Signed-out visitors and
  ordinary users both see the normal 404, so the portal's existence is not
  advertised.
- Every route under `app/api/platform/` uses a new `requirePlatformAdmin()`
  gate in `lib/apiAuth.ts`, which answers 404 to everyone else.
- The header shows a "Platform" icon button beside the avatar when the server
  says the viewer is a platform admin, in the spot the old Experiments button
  had. It is a 34px bordered circle matching `AvatarButton`, with the lucide
  `Radar` icon in `#7dd3fc`, so the two read as a pair. On small screens it is a link in the menu sheet. `getNavSession`
  adds the boolean to the session it already builds, so the browser never sees
  the list of ids. The button is a convenience; the checks above are the
  protection.
- No RLS policy is added or widened. All cross-league reads and the delete run
  on the server with the service-role client, after the gate. A caller with
  their own session and the public Supabase key gains nothing.

Sign-in is by emailed code, so the portal is as secure as the admin's inbox.
A second factor is out of scope for this version.

## Pages

Everything stays inside the existing `max-w-2xl` column.

### `/platform`

1. **Totals.** Leagues, accounts, and how many of each are new in the last 7
   and 30 days.
2. **Milestones.** How many leagues have reached each of: roster added (two or
   more players, since the creator is added automatically), first result, four
   results, second member joined. These are counts, not a strict funnel, since
   a league can reach them in any order.
3. **League list.** Newest first. Each row: name, address, creator, created
   date, counts of members, players and results, last activity, status.
4. **Audit log.** The last 20 entries: who did what, to which league, when.

### `/platform/[id]`

- Details: name, address, venue, day, kick-off, created date, creator name and
  email, a link to the public page.
- Members: name, email, role, joined date.
- The five most recent weeks: date, status, result.
- Delete league.

### Status

| Status | Rule |
|---|---|
| Not started | No week with a result |
| Active | Has a result, and a week was saved in the last 28 days |
| Stalled | Has a result, and no week was saved in the last 28 days |

"Last activity" is the newest `weeks.created_at` for the league. Weeks have no
updated timestamp, so recording a result on an existing week does not move it.
That is accurate enough to tell a live league from a dead one.

## Delete

1. The admin opens the delete dialog on `/platform/[id]` and types the league's
   address. The button stays disabled until it matches.
2. `DELETE /api/platform/leagues/[id]` with `{ confirm: "<address>" }`. The
   server checks the gate, then checks the address again against the database.
3. The server calls `platform_delete_league(p_game_id, p_actor)`. In one
   transaction it writes an audit row holding a JSON snapshot of the league's
   `games` row and every row in the ten child tables, then deletes the `games`
   row. The cascade removes the rest. If the snapshot cannot be written,
   nothing is deleted.
4. The server calls `revalidateLeague(id, [slug])` and the page returns to
   `/platform`.

Members keep their accounts. Nobody is emailed. There is no restore screen: a
snapshot is restored by hand with SQL if ever needed. A daily job clears the
snapshot 30 days after the delete (migration `20261119000004`); the log line
stays.

## Database

One migration, `20261117000002_platform_admin.sql`, applied by hand before the
code ships.

1. **`platform_audit_log`**: `id`, `action`, `actor_id`, `actor_email`, `game_id`,
   `game_slug`, `game_name`, `snapshot jsonb`, `created_at`. RLS enabled with
   no policies, and all privileges revoked from `anon` and `authenticated`, so
   only the service role can read or write it.
2. **`platform_leagues()`**: returns one row per league with the creator's
   name and email, the counts and the last activity. One query instead of
   several per league.
3. **`platform_delete_league(uuid, uuid)`**: as described above.
4. Both functions run with the caller's rights (not `SECURITY DEFINER`), and
   EXECUTE is revoked from `PUBLIC`, `anon` and `authenticated` and granted to
   `service_role` only. Supabase grants EXECUTE on new functions by default,
   so the revoke is required. Running with the caller's rights means a slipped
   grant still leaves RLS in the way.
5. Add `platform` to the reserved words in the `games_slug_format` constraint.
6. Drop `profiles.role` (its check constraint goes with it).

## Order of release

1. Apply the migration. Confirm with a read-only query against production that
   `authenticated` cannot execute either function or read the audit table, and
   that `profiles.role` is gone.
2. Set `PLATFORM_ADMIN_IDS` in Vercel and in `.env.local`.
3. Merge.

Each step fails closed. Without the variable, the portal is a 404 for
everyone. Without the migration, the list shows an error and delete refuses.

## Tests

- `isPlatformAdmin`: unset variable, empty string, spacing around ids, a match,
  a non-match.
- Delete route: a non-admin gets 404 and the database function is never
  called; a wrong address gets 400; an admin with the right address calls it
  once and revalidates.
- Status and milestone helpers, as pure functions.

## Documentation

`CLAUDE.md` gains the `/platform` route, the `PLATFORM_ADMIN_IDS` variable and
a line in the access model. `.env.example` gains the variable.

## Not in this version

- Signing in as another user, or editing another league's data.
- Suspending or deleting user accounts.
- Archiving a league instead of deleting it.
- Restoring a deleted league from the portal.
- Page-view analytics. This needs an analytics package and is a separate
  decision.
- Last sign-in times. With emailed codes and long sessions, the stored value
  only moves on a fresh sign-in, so it says little about real use.
- A second sign-in factor for the admin.
