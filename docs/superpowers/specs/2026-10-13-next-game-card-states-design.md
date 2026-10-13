# Next game card: compact idle and kick-off awaiting state — design

**Date:** 2026-10-13

**Builds on:** `2026-10-01-overview-tab-design.md` (card 1, next game).

## Summary

The Overview next game card spends most of the week showing a large empty
state, because lineups are only built on game day. And from 20:00 on game day
it drops the game and jumps to next week's empty state, even when nobody has
recorded the result yet.

This change gives the Overview card four clear states across a week:

1. **No lineup yet**: a single compact row, with Cancel and Build Teams for
   anyone who can enter matches.
2. **Lineups set**: unchanged.
3. **Awaiting result**: from kick-off until the result is saved, with Result
   Game up front.
4. **Result saved**: straight back to state 1 for the next week. The result
   shows in the league table card's Last result strip, as today.

The moment a game becomes "awaiting result" moves from a fixed 20:00 to the
league's kick-off time, on Overview and Results alike, so the two tabs never
disagree.

## Decisions (settled during brainstorming)

1. **No feature flag.** A visual and timing change to an existing card.
2. **Build Teams and Cancel are always offered before lineups exist**, to
   whoever `match_entry` allows (admins always), as today.
3. **No result state in the card after the result is saved** (option 1). The
   table card's Last result strip already covers it.
4. **The kick-off rule is shared.** Results switches at kick-off too. The
   compact state 1 and the new awaiting card are Overview only; the Results
   idle row is already compact.

## The kick-off rule

`isPastDeadline(date)` in `lib/utils.ts` today means "after 20:00 local time on
the game date". It gains an optional second argument:

```ts
isPastDeadline(dateStr: string, kickoffTime?: string | null): boolean
```

- With a parseable `kickoffTime`, the deadline is that time on the game date.
- Without one (unset, null, or unparseable), the deadline stays 20:00.

Kick-off times are stored as `HH:MM` by the league details form (`18:30`). The
parser also accepts the older `6:30pm` / `7pm` form, case-insensitive, since
`lib/types.ts` documents it and older rows may hold it. A new pure helper,
`parseKickoffTime(value): { hours, minutes } | null`, does the parsing.

### Callers that switch to kick-off

These decide when a scheduled game stops being "next" and becomes "awaiting
result", so they pass the league's `kickoff_time`:

| Caller | Effect |
|---|---|
| `getNextMatchSeed` (Overview first paint) | See State 3 below |
| `NextMatchCard` client `load()` and its badge and action checks | Results next match card goes idle at kick-off |
| `results/page.tsx` `nextWeek` derivation | Public and read-only Results views agree |
| `MatchCard` (scheduled week: hidden vs `AwaitingResultCard`) | The Awaiting Result card appears in the Results list at kick-off |

`kickoff_time` is already on the `game` row each page loads. It is threaded
down as a `kickoffTime` prop to `NextMatchCard` (all variants, not just
Overview), and to `MatchCard` through `WeekList` and `PublicMatchList`.

### Callers that keep 20:00

Out of scope, left unchanged: `ensureUnrecordedWeek` (creating `unrecorded`
rows), the lineup share route's access check, and `nextLeagueGame` (league
share preview).

## State 1: no lineup yet (Overview)

`NextGameIdle` in `components/overview/NextGameCard.tsx` is replaced with a
single row. The ghost columns, the "Lineups not set yet" heading and the note
are removed.

- Left: `Next game` label, `Week 24` title, then a meta line
  `Thu 23 Oct · 18:30` (`formatFixtureDate` of the next match date, then the
  kick-off time). Either part is omitted with its separator when missing; the
  meta line is omitted when both are.
- Right, when `canEdit`: **Cancel** (red outline, opens the existing cancel
  confirmation dialog) then **Build Teams** (primary), both `h-8`, `text-xs`.
- Right, otherwise: the existing dashed `No lineup` badge.
- No header band: the card is one padded row, `px-4 py-3`.

`NextGameIdle` gains `date` (the next match date, `DD MMM YYYY`) and
`kickoffTime` props. `NextMatchCard` already computes `nextDate`.

## State 2: lineups set

Unchanged. The existing `awaitingResult` badge swap inside `NextGameLineup` is
removed, since an awaiting game now renders state 3 instead.

## State 3: awaiting result (Overview)

### When it shows

The Overview card shows state 3 for the latest scheduled week when:

- the week's status is `scheduled`, and
- `isPastDeadline(date, kickoffTime)` is true (kick-off has passed), and
- the awaiting window has not closed: it closes at the end of the day after the
  game date (00:00 two days after). A new helper,
  `isAwaitingWindowOver(dateStr)`, answers this.

When the window closes with no result, the card moves on to state 1 for the
next week. The game stays in the Results list as Awaiting Result, as today.

### Data

`getNextMatchSeed(weeks, kickoffTime?)` changes:

- latest week with status `scheduled`, `cancelled` or `unrecorded`, as now
- `unrecorded` → `null`
- `cancelled` past the deadline (kick-off) → `null`
- `scheduled` past the deadline and the awaiting window is over → `null`
- otherwise → that week as a `ScheduledWeek` (including an awaiting one)

`NextMatchCard` with `variant="overview"` renders state 3 when its
`scheduledWeek` is `scheduled` and `isPastDeadline(date, kickoffTime)`; it
renders `NextGameLineup` otherwise. This is evaluated at render, so a page
opened before kick-off switches on the next refresh, as the badge does today.

Results is unaffected by the awaiting window: its next match card goes idle at
kick-off and the list's `AwaitingResultCard` takes over.

### Look

A new presentational component, `NextGameAwaiting`, in
`components/overview/NextGameCard.tsx`.

- Header band (same as `NextGameHeader`): label `Kicked off 18:30`, or
  `Game day` when the league has no kick-off time; title `Week 23`; badge
  `Awaiting result` in amber: `border-[#fbbf24]/40 bg-[#fbbf24]/8
  text-[#fbbf24]` with a static 6px amber dot (no pulse).
- Body, `px-4 py-2.5`: two lines, `Team A` in `#7dd3fc` and `Team B` in
  `#c4b5fd` as 10.5px bold uppercase labels in a fixed 52px column, then the
  names as stored, comma separated, `font-inter-body text-[11.5px]
  text-[#cfe0f4]`, clamped to two lines.
- Action band, when `canEdit`: **Edit Lineups** (outline) and **Result Game**
  (primary, wider), same handlers and recipe as `NextGameLineup`. No Share.
- Members without `match_entry` and the public see the card without the
  action band.
- Card border `#2c4a72` (open/featured), so it reads as needing attention.

## State 4: result saved

No new UI. Saving a result calls `router.refresh()` (or reloads for the public
tier); the seed then returns `null` or the next scheduled week, and the card
shows state 1 or 2. The Last result strip in `OverviewTableCard` shows the
result.

## Unchanged

- The building (team builder) and cancelled states, on both tabs.
- Who can act: `canEdit` is `isAdmin || match_entry` for the tier, as now.
- The Results tab next match card's look in every state.
- Copy elsewhere in the app that says "Awaiting Result".

## Files

Changed:

- `lib/utils.ts`: `isPastDeadline` second argument, `parseKickoffTime`,
  `isAwaitingWindowOver`, `getNextMatchSeed`
- `components/overview/NextGameCard.tsx`: compact `NextGameIdle`, new
  `NextGameAwaiting`, drop `awaitingResult` from `NextGameLineup`
- `components/NextMatchCard.tsx`: `kickoffTime` prop for every variant, pass it
  to every `isPastDeadline` call, render `NextGameAwaiting` on Overview
- `components/overview/OverviewNextGame.tsx`,
  `app/[slug]/(tabs)/overview/page.tsx`: pass `kickoffTime` to the seed and
  card
- `app/[slug]/(tabs)/results/page.tsx` and the components between it and
  `NextMatchCard` / `MatchCard` (`ResultsSection`, `ResultsRefresher`,
  `PublicMatchEntrySection`, `PublicResultsSection`, `WeekList`,
  `PublicMatchList`): thread `kickoffTime`
- `components/MatchCard.tsx`: `kickoffTime` prop on the scheduled branch

## Conventions

Tailwind utilities only, palette hex values, `cn()` for conditional classes,
labels in normal case with `uppercase`, British English, no em dashes in UI
copy, focus ring as the existing buttons.

## Testing

Unit (Jest), in `lib/__tests__/utils.deadline.test.ts` and `lib/__tests__/utils.overview.test.ts`:

- `parseKickoffTime`: `18:30`, `09:00`, `6:30pm`, `7pm`, `7PM`, empty, null,
  garbage.
- `isPastDeadline`: with and without kick-off time, just before and after each,
  unparseable falls back to 20:00.
- `isAwaitingWindowOver`: game day, the day after, two days after.
- `getNextMatchSeed`: scheduled before kick-off; scheduled after kick-off
  within the window (returned); after the window (null); cancelled after
  kick-off (null); unrecorded (null); no kick-off time behaves as 20:00.

Component (React Testing Library), in `__tests__/overview-next-game-card.test.tsx`:

- `NextGameIdle`: one row with week and meta; Cancel and Build Teams only with
  `canEdit`, `No lineup` badge otherwise; meta parts omitted when missing; both
  buttons call their handlers.
- `NextGameAwaiting`: `Kicked off 18:30` or `Game day`; both team lines;
  actions only with `canEdit` and wired to their handlers.
- `NextGameLineup`: no longer renders an awaiting badge.

Manual, at 390px, as admin, member and signed out, with the system clock or
test data around kick-off: each of the four states on Overview, and on Results
that the next match card goes idle and the Awaiting Result card appears at
kick-off.

## Out of scope

- A result card in the next game slot after the result is saved.
- Any change to `ensureUnrecordedWeek`, the lineup share access check or the
  league share preview's "next game".
- Live switching at kick-off without a refresh.
