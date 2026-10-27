# League creation, slice 1: create path — design

**Date:** 2026-10-27

## Summary

Nobody can create a league today. The documented add-game route was deleted
in March, the `create_game` RPC fails because `games.slug` is NOT NULL, and
nothing calls it. The full "Create a league" onboarding flow is specified in
the design handoff (`2026-10-27-league-creation-handoff.md`, nine screens plus
backend). It is too big for one PR, so it ships in five slices:

1. **Create path** (this spec): rewritten RPC, `POST /api/games`, slug fixed
   at creation, wizard shell with Name, Where (free text), When, and a minimal
   Live screen. Entry points on Your leagues and the avatar menu.
2. **Roster**: Who plays, Mentality, Strength, writing through
   `promote_roster`.
3. **Account step**: inline sign-up and code entry for visitors.
4. **Past results**: `import_weeks`, `games.fees_from`, the game modal.
5. **Polish**: Places autocomplete and map, confetti, landing CTA, settings
   link.

Each slice leaves main shippable. After slice 1 a signed-in user can create a
league end to end and finish the rest in Settings.

## Decisions (settled during brainstorming)

1. **Slicing and order as above.** Account stays in slice 3; slice 1 sends
   signed-out visitors to `/sign-in?redirect=/new`.
2. **Pre-creation state lives in one client component.** `/new`, `/new/name`,
   `/new/where` and `/new/when` are one page. Steps change with
   `window.history.pushState`, which Next 16 syncs to `usePathname`, so the
   back button works. A refresh loses the three answers and restarts at Name.
   No sessionStorage, no query params.
3. **The Live screen shares the public league URL, not an invite link.**
   Open invite tokens are single-use (`accept_game_invite` deletes the row)
   and expire after seven days, so "one link to the group chat" cannot use
   them. Players tap Join League on the public page, pick their name (roster
   names are already claimable since migration 20261019) and the admin
   approves in one step. Reusable invites may be revisited later.
4. **The creator's player row and approved claim are written by
   `create_game`**, not deferred to slice 2. Every league created from slice
   1 onwards has its admin as a player (handoff decision 3).
5. Handoff decisions 1 to 7 stand: sign-up first, weekly only, no format
   field, slug set once and never regenerated, everyone can create a league.

## What already exists (no work needed)

- `get_unclaimed_players` includes roster-only names.
- `DEFAULT_FEATURES` is empty, so the RPC seeds no `league_features` rows.
- Sign-up already sends `first_name` and `last_name` in auth metadata.
- The details PATCH does not enforce 30-minute kick-off steps; only the
  Settings form's `<select>` lists them.
- `resolveUniqueSlug(name, excludeId?)` in `lib/slug.ts`, `generateSlug` in
  `lib/utils.ts`, `parseKickoffTime`, `dayNameToIndex` and
  `nextOccurrenceAfterToday` in `lib/dates.ts`, `requireUser` in
  `lib/apiAuth.ts`, `leagueLandingPath` in `lib/utils.ts`.

## Routing and guards

| Path | Renders | Guard |
|---|---|---|
| `/new`, `/new/name`, `/new/where`, `/new/when` | `app/new/[[...step]]/page.tsx` → `NewLeagueWizard` (client) | proxy |
| `/new/[slug]/live` | `app/new/[slug]/live/page.tsx` (server) | page: admin of that league, else redirect to the league |

- `proxy.ts` treats `/new` and `/new/*` like `/settings`: signed-out →
  `/sign-in?redirect=…`, no profile → `/profile-required`.
- The wizard derives the step from the pathname. `/new` and `/new/name` show
  Name. A hard load of `/new/where` or `/new/when` with an empty name calls
  `replaceState` to `/new/name`.
- `/new/[slug]/live` is a static-depth route and wins over the optional
  catch-all. Later slices add `/new/[slug]/players` etc. beside it.
- No app header on these pages: the `/new` layout renders children only.

## Wizard (client)

Files in `components/new-league/`:

- `StepShell.tsx`: the shared frame from the handoff. Logo tile, step
  eyebrow (`STEP n/8`; hidden on Live), H1, sub, control slot, primary
  button, optional secondary link. Content column `max-w-[520px]`, dot grid
  behind the top. Tailwind classes only; exact values from the handoff's
  "Shared page shell".
- `NewLeagueWizard.tsx`: holds `{ name, bio, location, day, time }`, the
  step, and submit state. Renders the step components below.
- `NameStep.tsx`: input (maxLength 80), live URL preview
  `craft-football.com/{slug}` fetched from `GET /api/games/slug?name=`
  (debounced 300 ms, falls back to `generateSlug(name)` while loading).
  Secondary link "Add a short bio" reveals the textarea and hides itself.
  Continue disabled while the name is blank.
- `WhereStep.tsx`: a single text input, placeholder "Pitch or venue name".
  Continue disabled while blank. Saved to `games.location`.
  `// shortcut: free text only, Places autocomplete and map preview arrive in slice 5`
- `WhenStep.tsx`: seven day pills (Mon…Sun) and the kick-off stepper. Steps
  of 15 minutes via minus/plus and arrow keys; the centre input accepts typed
  values. Invalid text turns the border red and reverts on blur. Sub reads
  "Same slot every week. Your first match goes in the diary for the next
  {day}." Default day Thursday, default time 20:00. Primary "Create league".

Kick-off parsing: `parseKickoffInput(text): string | null` in `lib/dates.ts`
returns `'HH:MM'` or null. Accepts `8`, `8:15`, `8.30`, `20:15`, `8pm`,
`8.30pm`, `8:30 pm`. A bare hour under 6 with no am/pm is treated as pm. Minutes
are rounded to the nearest 15. Unit tested.

On Create league: `POST /api/games` with
`{ name, bio, location, day, kickoff_time }`. On 409 (slug taken between
preview and submit) retry once. On success `router.push('/new/{slug}/live')`.
Slice 2 changes this destination to `/new/{slug}/players`.

## Backend

### Migration `supabase/migrations/20261027000001_create_league.sql`

```sql
DROP FUNCTION IF EXISTS public.create_game(text);

CREATE OR REPLACE FUNCTION public.create_game(
  p_name text, p_slug text, p_location text, p_day text,
  p_kickoff_time text, p_bio text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- 1. auth.uid() required; trimmed name and slug non-empty
-- 2. INSERT games (name, slug, location, day, kickoff_time, bio, created_by)
-- 3. INSERT game_members (game_id, user_id, 'creator')
-- 4. v_player := trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
--    from profiles, falling back to display_name
-- 5. INSERT player_attributes (game_id, name, rating 2, mentality 'balanced', goalkeeper false)
-- 6. INSERT player_claims (game_id, user_id, player_name, status 'approved', reviewed_by = auth.uid())
-- 7. RETURN game id
$$;
GRANT EXECUTE ON FUNCTION public.create_game(text,text,text,text,text,text) TO authenticated;
```

`claim_profile` is recreated to also insert `first_name` and `last_name` from
`auth.jwt()->'user_metadata'` (only on insert; existing rows untouched).

Production migrations are applied by hand in the Supabase SQL editor; this
one must run before the PR is deployed.

### `POST /api/games` (`app/api/games/route.ts`)

- `requireUser()`.
- Body: `name` required, trimmed, 1 to 80 chars. `day` must be one of the
  seven full day names (same list as the details route). `kickoff_time` must
  match `^\d{2}:\d{2}$`. `location` and `bio` optional strings, trimmed, null
  when empty.
- `slug = await resolveUniqueSlug(name)`.
- `supabase.rpc('create_game', …)` with the user's client (the RPC needs
  `auth.uid()`). A unique violation on `games_slug_unique` returns 409
  `{ error: 'slug_taken' }`; other RPC errors use `rpcErrorStatus`.
- Returns `{ id, slug }`.

### `GET /api/games/slug?name=` (`app/api/games/slug/route.ts`)

- `requireUser()`. Returns `{ slug: await resolveUniqueSlug(name) }`, or 400
  when `generateSlug(name)` is empty.

### Details PATCH (`app/api/league/[id]/details/route.ts`)

Remove the `resolveUniqueSlug` call and the `slug` column from the update.
Keep reading the current slug so the response shape `{ ok, slug }` and the
`revalidateLeague` tags are unchanged. Update the route comment. The
`LeagueDetailsForm` redirect keeps working because the slug it receives is the
current one.

### `ensureUnrecordedWeek` (`lib/fetchers.ts`)

Add `if (weeks.length === 0) return weeks` before computing the recent date.
Without it a brand-new league with `day` set gets an `unrecorded` week for
last week's match day the first time the admin opens Results or Overview.
Slice 4 handles the gap between imported weeks and today separately.

## Live screen

`app/new/[slug]/live/page.tsx`, server component:

- Loads the league by slug (id, name, day), checks the viewer is creator or
  admin via `getAuthAndRole`; otherwise `redirect(leagueLandingPath(slug, …))`.
- Reads roster names from `player_attributes` (slice 1: the creator only) and
  computes the next match date with `nextOccurrenceAfterToday(dayNameToIndex(day))`.
- Renders inside `StepShell` without the eyebrow: `LEAGUE CREATED` pill, H1
  `{name}` / `is live.`, sub "Week 1 is in the diary for {Thursday 30 Oct}.",
  the invite card, and the outline button "Go to {name}" →
  `leagueLandingPath`.
- Invite card (client component `LiveShareCard.tsx`): eyebrow `ONE THING
  LEFT`, title "Get your players in", sub "{N} players on your roster, none
  of them in yet. One link to the group chat and they pick their name, see the
  table and get picked for {day}.", roster as dashed initials chips, primary
  "Share with the group" (`navigator.share({ title: name, url })`, falls back
  to copy), the URL `https://craft-football.com/{slug}` in a mono box with
  "Copy link" ("Copied" for 1.6 s), footnote "Anyone with the link can ask to
  join and pick their name. You approve them in one tap, and their stats
  follow them. You can share it any time from Settings."
- No confetti and no rise animation (slice 5).

## Entry points

- `app/page.tsx`: the empty state gets a primary "Create a league" button
  linking to `/new`; the multi-league list gets a dashed row "Create a league"
  after the last league.
- `components/ui/navbar.tsx`: a "Create a league" item with the `Plus` icon
  above "Account Settings" in the avatar sheet.
- Landing CTA and the `/settings` Linked leagues link wait for slice 5.

## Error handling

- Wizard: a failed POST shows the API error under the primary button and
  re-enables it. Network failure shows "Could not create the league. Check
  your connection and try again."
- Slug preview failure falls back silently to `generateSlug(name)`.
- Live page for a non-admin or unknown slug redirects rather than erroring.

## Testing

- `lib/__tests__/dates.parseKickoffInput.test.ts`: the accepted forms above,
  rounding, rejection of `25`, `8:70`, `abc`.
- `lib/__tests__/fetchers.test.ts`: `ensureUnrecordedWeek` returns the input
  untouched for an empty list and does not call the RPC.
- `app/api/games/__tests__/route.test.ts`: 401 signed out, 400 for blank
  name, bad day and bad time, 200 passes the resolved slug and all fields to
  the RPC, 409 on a unique violation.
- Manual: create a league signed in on local dev against a throwaway name,
  check Results shows no unrecorded week, rename it in Settings and confirm
  the URL is unchanged.

## Out of scope for this slice

Account step, roster steps, past results import, Places autocomplete, map
preview, confetti, landing CTA change, settings link, reusable invite links,
`games.fees_from`.
