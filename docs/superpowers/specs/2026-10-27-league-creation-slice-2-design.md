# League creation, slice 2: roster steps — design

**Date:** 2026-10-27

## Summary

Slice 1 (PR #194) lets a signed-in user create a league and lands them on the
Live screen with only themselves on the roster. This slice adds the three
roster screens from the handoff (`2026-10-27-league-creation-handoff.md`,
screens 5 to 7): Who plays, Mentality and Strength. Nothing is written until
Strength's Continue, which upserts the whole roster in one call. Then the user
lands on Live, which already shows unclaimed roster players as chips.

Branch stacks on `awmloveland/craft-football-onboarding`; the PR targets that
branch and is retargeted to main once #194 merges.

## Decisions (settled during brainstorming)

1. **Match the handoff's control sizes.** `MentalityControl` and
   `StrengthPills` gain a `size="lg"` variant (segments 46px and 58px wide,
   38px tall, 6px radius) rather than the wizard drawing its own controls, so
   Settings → Players and the wizard keep one implementation.
2. **One write at the end of Strength**, through a new
   `PUT /api/league/[id]/roster` that makes a single `promote_roster` call.
   The codebase's convention is API routes with validation, not client-side
   RPCs, so the handoff's "one `promote_roster` call" lives behind a route.
3. **The creator is always first and cannot be removed.** Their name comes
   from their approved claim, written by `create_game` in slice 1. Their row
   is included in the batch so Strength and Mentality update it (the RPC
   upserts on name).
4. **Roster state lives in one client component** across the three URLs,
   with `pushState` for step changes, exactly as slice 1's wizard. A hard load
   of mentality or strength with only the creator on the list goes back to
   players. A refresh loses unsaved names, same as slice 1.
5. **The wizard is seeded from the saved roster.** `RosterScreen` passes every
   `player_attributes` row (creator first, strength from the rating) so coming
   back from Live, or refreshing after a save, shows the list rather than an
   empty one. Saving again upserts the same names. It is still not a tool for
   editing an established roster.
6. **The list always ends in a blank row.** There is no Add button: the last
   row is an empty input, focusing it appends another blank beneath, Enter
   moves to the next row, and a blank row that is not last disappears on blur.
   Blank rows never leave the client.

## Routing

| Path | Renders |
|---|---|
| `/new/[slug]/players`, `/new/[slug]/mentality`, `/new/[slug]/strength` | `app/new/[[...step]]/page.tsx` → `RosterScreen` (server) → `RosterWizard` (client) |

- The wizard's Create league now routes to `/new/[slug]/players`.
- `RosterScreen` loads the league by slug (404 if missing), requires creator
  or admin (else redirects to the league), reads the viewer's approved claim
  (`admin_override_name ?? player_name`; redirects to Live if none) and the
  current roster names, and renders `RosterWizard` with league id, slug, the
  viewer's player name and the existing names.
- `STEP_COUNT` becomes 6. Eyebrows read 4/6, 5/6, 6/6.

## Screens

### Who plays (`PlayersStep`)
H1 "Who plays?", sub "Add the regulars by name. They do not need an account yet."

- List, gap 8px: creator row first (50px, `border-[#38bdf8]/45`, name, `YOU`
  badge), then player rows (50px, `border-[#1b2c46]`, inline-editable name
  input that trims on blur and removes the row when left blank, an `X`
  remove button), then a dashed blank row with placeholder "Add a player".
  Focusing the blank row appends another beneath it; Enter moves focus down
  a row; a blank row that is not last is removed on blur. A name that
  duplicates another row (case-insensitive) shows "{name} is already on the
  list" under the list and disables Continue.
- Secondary link "Paste a list instead" adds, under the rows, a 5-row
  textarea in a `border-[#38bdf8]/45` box, placeholder "One name per line,
  or separated by commas", with a full-width "Add N players" button where N
  counts the new names after splitting and de-duplicating. The link then
  reads "Add one at a time instead".
- Counter under the list, Plex Mono 9.5px uppercase: `{n} players · 10 fills
  two sides of five` in `#4f688a`, or `{n} players · enough for two sides` in
  `#bef264` at ten or more.
- Continue disabled below two players.

Splitting is `splitPastedNames(text)` in `lib/playerUtils.ts`: splits on
newlines, commas, `&`, `/` and the word `and`, trims, drops blanks, and
de-duplicates case-insensitively keeping the first spelling. Unit tested.

### Mentality (`MentalityStep`)
H1 "How does each of them play?", sub "GK is a dedicated keeper, in goal every
game. Defensive, balanced and attacking help spread the shape across both
sides." One row per player, creator first with the badge, name left and
`<MentalityControl size="lg">` right. Default balanced. Continue (no skip).

### Strength (`StrengthStep`)
H1 "Who is above or below average?", sub "A gut call to seed the first
lineups. It fades out over each player's first ten games. Members can see it,
so keep it fair." Same rows with `<StrengthPills size="lg">` (labels Below ·
Avg · Above). Default average. Continue sends the roster; while sending the
button reads "Saving…" and is disabled; an error shows under it and
re-enables the button.

## Backend

### `PUT /api/league/[id]/roster` (`app/api/league/[id]/roster/route.ts`)
- `requireLeagueAdmin(id)`.
- Body `{ players: [{ name, strength, mentality }] }`, 1 to 60 entries, each
  validated by the existing `parseAddPlayerBody`. Duplicate names within the
  batch (case-insensitive) → 400 naming the duplicate.
- One `promote_roster` call with `rating = strengthToRating(strength)` and
  `goalkeeper = mentality === 'goalkeeper'`, matching the players POST.
- `revalidateLeague(id)`; returns `{ ok: true, count }`.
- No case-insensitive check against rows already in `player_attributes`
  (the client checks against the names the screen was given). Marked with a
  `shortcut:` comment; add the POST route's `ilike` check if this route is
  ever reused for established leagues.

No migration. `promote_roster` already accepts the batch shape.

## Error handling

- Network failure on save: "Could not save the roster. Check your connection and try again."; non-400 failure: "Could not save the roster. Try
  again." under the button. 400 messages are shown as returned.
- A hard load of mentality or strength with fewer than two players redirects
  to players through `router.replace`.

## Testing

- `lib/__tests__/playerUtils.splitPastedNames.test.ts`: separators, the word
  `and` only as a whole word ("Andy and Sandra" gives two names), trimming,
  case-insensitive de-duplication.
- `__tests__/roster-route.test.ts`: 401 signed out, 403 non-admin, 400 for an
  empty list, a bad entry and a duplicate, 200 passing the mapped entries to
  `promote_roster` once and revalidating.
- Manual (Will, signed in on local dev): create a league, add players by
  typing and by paste, set mentalities and strengths, confirm Settings →
  Players shows them with the chosen values and Live shows the chips, then
  delete the league.

## Out of scope

Account step (slice 3), past results and the game modal (slice 4), Places,
confetti and the landing CTA (slice 5), editing an established roster through
this flow.
