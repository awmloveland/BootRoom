# Awaiting-result card drops snapshot + weeks before `ResultModal`

## Problem

Two visible bugs, one root cause.

**Bug 1 — Team A rating drift between lineup save and result recording.**
Pre-result, the Week 19 lineup card shows Team A = 41.856 and Team B = 41.710.
After recording the result, the played `MatchCard` shows Team A = 40.505 and
Team B = 41.710. PR #111 ("Fix team rating drift between lineup save and
result recording") was supposed to make this impossible by routing the result
write through `resolveTeamRatingForResult(snapshot, …)` — but the bug still
reproduces when the user records from an *Awaiting Result* card rather than
the live `NextMatchCard`.

**Bug 2 — Highlights in the share step read as if the league started tonight.**
Streaks, milestones, the quarter standings, and the in-form line are all
empty or only reference tonight, even though the league has weeks of history.
The share button on the resulted `PlayedCard` (rendered after a page refresh)
shows the correct, history-aware highlights.

Both reproduce only when the result is recorded via the *Awaiting Result*
card path — clicking *Record Result* on a `scheduled` row whose deadline has
passed.

## Root cause

`MatchCard.AwaitingResultCard` constructs a fresh `ScheduledWeek` to hand to
`ResultModal`, and it strips two things on the way:

1. **The rating snapshot.** The local `ScheduledWeek` literal
   (`components/MatchCard.tsx:354`) omits `team_a_rating` and `team_b_rating`,
   so `scheduledWeek.team_a_rating` is `undefined` inside `ResultModal`.
   `resolveTeamRatingForResult(undefined, …)` falls through to the legacy
   `ewptScore` recompute. Since PR #113 introduced a 0.85× WPR discount for
   "average"-hint guests, the recompute now differs from the snapshot when
   the lineup contains any such guest — exactly the `Lloyd +1` case in the
   repro. Team B has no guests, so its recompute matches the snapshot and it
   doesn't drift.

2. **The league context.** The `ResultModal` invocation at
   `components/MatchCard.tsx:440` hard-codes `leagueName=""` and `weeks={[]}`.
   That happens because `WeekList` only forwards `leagueName`/`leagueSlug`/
   `weeks` to the most-recent played/DNF card (`components/WeekList.tsx:77`),
   using prop presence as an implicit "is this the latest game?" signal for
   the share button. Awaiting-result cards always get `undefined`. With an
   empty `weeks` array, `buildResultShareText` has no prior games to derive
   streaks, milestones, the Q-table, or in-form from — the highlights look
   like the league just started.

Both data losses originate in the same place: an awaiting-result card has no
way to receive the data it needs to drive the modal correctly.

## Fix

Plumb the missing props through, and make the "most-recent" signal explicit
so it stops doubling as a side-channel for data presence.

### `components/WeekList.tsx`

Pass `leagueName`, `leagueSlug`, and `weeks` to every `MatchCard`
unconditionally. Add an explicit `isMostRecent` boolean derived from the
existing `mostRecent` calculation:

```tsx
<MatchCard
  …
  leagueName={leagueName}
  leagueSlug={leagueSlug}
  weeks={weeks}
  isMostRecent={week.week === mostRecent?.week}
/>
```

The `mostRecent` derivation (sorted played-or-dnf, take first) is unchanged.

### `components/MatchCard.tsx`

Accept `isMostRecent?: boolean` (default `false`) at the top-level
`MatchCard` and forward it to `PlayedCard`, `DnfCard`, and
`AwaitingResultCard`.

**`PlayedCard` and `DnfCard`** — switch the share-button gate from prop
presence to `isMostRecent`. The other half of the gate
(`leagueName && leagueSlug && weeks`) stays as a TypeScript-level guard,
but it will now always be truthy in normal use:

```tsx
{isMostRecent && leagueName && leagueSlug && weeks && (
  <button onClick={handleShare} …>Share</button>
)}
```

**`AwaitingResultCard`** — include the rating snapshot when building its
local `ScheduledWeek`, and forward the real `leagueName` / `weeks` into
`ResultModal`:

```ts
const scheduledWeek: ScheduledWeek = {
  …,
  lineupMetadata: week.lineupMetadata ?? null,
  team_a_rating: week.team_a_rating ?? null,
  team_b_rating: week.team_b_rating ?? null,
}
```

```tsx
<ResultModal
  …
  leagueName={leagueName ?? ''}
  weeks={weeks ?? []}
/>
```

The `?? ''` / `?? []` fallbacks remain as defensive defaults. In normal use
both are now real values.

## Testing

**Existing unit tests** stay green. `resolveTeamRatingForResult` and
`buildResultShareText` are unchanged — only the data reaching them changes.

**New regression test** alongside `__tests__/match-card-ratings.test.ts`:
render `MatchCard` with a `scheduled` week whose deadline has passed and
whose `team_a_rating` / `team_b_rating` are set, simulate clicking
*Record Result*, and assert that the `ResultModal` receives a
`ScheduledWeek` with both ratings set plus a non-empty `weeks` array and a
non-empty `leagueName`. This is the regression we'd want to catch if either
hard-coded default crept back in.

**Manual verification on the dev server:**
1. Save a lineup with at least one "average"-hint guest so the ewpt
   recompute would visibly differ from the snapshot.
2. Wait past the deadline (or edit the date) so the live `NextMatchCard`
   disappears and an *Awaiting Result* card appears in the results list.
3. Record the result via the *Awaiting Result* card.
4. Confirm: the resulted `PlayedCard` shows the same team rating the lineup
   card showed pre-game (Bug 1 fixed), and the share modal's Highlights
   match what *Share* on the resulted `PlayedCard` produces (Bug 2 fixed).

No DB migration, no backfill — purely client-side plumbing.
