# League creation, slice 4: past results import — design

**Date:** 2026-11-11

## Summary

After the roster steps, the admin can enter as many past games as they have
(handoff screen 8 and its game modal), then import them in one call and land
on Live. Every imported game seeds the first line-ups. Branch
`awmloveland/league-creation-results` stacks on slice 3 (PR #196).

## Decisions (settled during brainstorming)

1. **The game modal is built from `EditWeekModal`'s parts.** Its `LineupEditor`
   (two columns, chips, tap to move, drag, roster search) and its result picker
   with the margin stepper are exported and reused. The import modal adds only a
   week-by-week date stepper and a Save / Delete footer. No pitch drawing, no
   goalkeeper glove on chips. "+ Add player" opens the existing
   `AddRosterPlayerModal`, which writes the player immediately as Settings does.
2. **Games stay in client state until "Import N games and finish"**, which
   sends them all to `POST /api/league/[id]/weeks/import` → `import_weeks`.
   "Skip for now" goes to Live with nothing written.
3. **Fees cut off at the league's creation, no new column.** The Admin money
   page leaves out weeks dated before `games.created_at`. That page is the one
   entry point to fee computation.
4. **Unrecorded weeks are never created for game days before `created_at`.**
   This replaces slice 1's "no weeks yet" guard. Imported history therefore
   never triggers a missed-week row, and a real game day after creation still
   does. The handoff's import-ordering workaround is not needed.
5. **Dates travel as `'DD MMM YYYY'`**, the `weeks.date` format, from the modal
   to the API to the RPC. The RPC parses with `to_date(…, 'DD Mon YYYY')`.
6. **Numbering.** `season` is the date's year; `week` is 1..n per season in date
   order across every week of the league, renumbered after each import.

## Routing

`/new/[slug]/results` is served by the `/new` page → `ResultsScreen` (server:
league, roster, day, created_at, admin check) → `ResultsStep` (client).
`STEP_COUNT` becomes 7; the eyebrow reads 7/7 (8/8 for inline sign-ups).
Strength's Continue routes here instead of Live.

## Results step (`ResultsStep`)

H1 "Any past results?", sub "Every game you add makes your first lineups
fairer. After five games a player's rating stands on results, not your gut
call. Four to six games is the sweet spot."

- **Confidence card**: "Lineup confidence" with one line by count (0: "Optional.
  Every past result makes your first lineups fairer."; 1 to 2: "Every game you
  add makes your first lineups fairer."; 3 to 5: "Good start. More games,
  fairer lineups."; 6 to 9: "Plenty to start with. Add more if you have
  them."; 10+: "Full confidence. Lineups run on real results."), a percentage
  pill (10% per game, capped at 100) coloured `#8ba4c4` under 5, `#38bdf8` from
  5, `#bef264` from 10, ten segments below it, and tick labels `0`,
  `3 · useful`, `6 · good`, `10 · full` that light up once reached.
- **Saved games**, newest first: "Game n", `8 Oct 2026 · 4v3` (or `5-a-side`),
  the `ResultChip`. Tapping opens the modal in edit mode.
- Dashed "Add a game" / "Add another game" button, footnote "Each new game
  starts a week earlier with the last lineups in place, so you only move who
  changed."
- Primary "Import N games and finish" (disabled "Import games and finish" at
  0). Secondary "Skip for now" → `/new/[slug]/live`. While importing the
  button reads "Importing…"; a failure shows the API message under it.

## Game modal (`ImportGameModal`)

Dialog like `EditWeekModal` (same frame, header "Game n", close). Sections:

- **Date**: `‹ 8 Oct 2026 / Thursday ›` stepping one week on the league's match
  day. Forward is disabled past the most recent match day on or before today.
  A fresh draft starts one week before the oldest saved game, or at the most
  recent match day if none, with the oldest saved game's line-ups copied in.
- **Lineups**: `LineupEditor` with the roster plus a dashed "+ Add player" pill
  under it that opens `AddRosterPlayerModal`; a new player joins the roster
  list and the smaller side.
- **Result**: the exported result picker. Margin 1 to 20, 0 for a draw.
- **Footer**: "Save game" (disabled with the label "Pick both teams to save" or
  "Pick a result to save"); in edit mode "Delete game" on the left and "Save
  changes".

A player may not be on both sides (the editor already prevents it). A date
already used by another draft is refused with "You already have a game on
that date".

## Backend

### Migration `supabase/migrations/20261111000002_import_weeks.sql`

`import_weeks(p_game_id uuid, p_weeks jsonb) returns int` (count inserted),
SECURITY DEFINER, `is_game_admin(p_game_id)` required. Each element:
`{ date: 'DD Mon YYYY', team_a: text[], team_b: text[], winner: 'teamA' |
'teamB' | 'draw', goal_difference: int }`. Raises `invalid_date` (unparseable
or after today), `invalid_teams` (either side empty, or a name on both),
`invalid_winner`, `invalid_margin` (draw must be 0, otherwise 1 to 20),
`already_exists` (a week on that date for this league, in the batch or the
table). Inserts `status = 'played'`, `format` from the side sizes (`n-a-side`
when equal, otherwise `bigger v smaller`), null ratings, empty metadata; adds
`player_attributes` rows (rating 2, balanced) for names not yet present; then
renumbers every week of the league: `week = row_number()` per `season` by
date then `created_at`, via a temporary offset so the unique constraint holds.

### `POST /api/league/[id]/weeks/import`

`requireLeagueAdmin`. Body `{ games: [{ date, teamA, teamB, winner,
goalDifference }] }`, 1 to 200 entries, date matching `/^\d{2} [A-Z][a-z]{2}
\d{4}$/`, arrays of non-blank strings, winner in the three values, integer
margin. Calls the RPC once, `revalidateLeague`, returns `{ ok, count }`.
`already_exists` → 409 via `rpcErrorStatus`.

### `ensureUnrecordedWeek(leagueId, weeks, leagueDayIndex?, createdAt?)`

Returns `weeks` unchanged when the candidate date is before the day
`createdAt` (ISO timestamp) falls on, league time. `GAME_COLUMNS` gains
`created_at`; the Results and Overview pages pass `game.created_at`. The
empty-list guard goes.

### Fees

`lib/fees.ts` gains `weeksSinceCreation(weeks, createdAt)`; the Admin page
applies it before its existing status filter.

### Live

The sub reads "{N} games imported. Week {next} is in the diary for {date}."
when the league has played weeks, else as today.

## Testing

- `__tests__/import-route.test.ts`: 401, 403, 400 for each validation rule,
  200 with the exact RPC payload and revalidation, 409 on `already_exists`.
- `lib/__tests__/fetchers.test.ts`: the created-at rule (before: nothing;
  on or after: the row is created); the old "no weeks" case now passes a
  `createdAt` after the candidate date.
- `lib/__tests__/fees.weeksSinceCreation.test.ts`.
- `__tests__/results-step.test.tsx` (jsdom): confidence copy and percent by
  count; the date stepper's forward bound; a fresh draft copying the oldest
  game's line-ups and stepping a week earlier.
- `__tests__/edit-week-modal-tap-to-move.test.tsx` still passes after the
  export refactor.
- Manual (Will): create a league, add players, enter three past games (one a
  draw, one with a new name added from the modal), import, check Results shows
  them numbered by date with no unrecorded week, Admin shows no fee debt for
  them, Live says "3 games imported", then delete the league.

## Out of scope

Editing imported games (Results tab), DNF or cancelled past games, the pitch
graphic, Places/confetti/landing CTA (slice 5).
