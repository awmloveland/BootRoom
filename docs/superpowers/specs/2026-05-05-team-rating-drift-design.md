# Team rating drift between lineup save and result recording

## Problem

Team ratings displayed for a played week disagree with the ratings shown
pre-game. Reported example: a recent game where both teams were rated ~42.0
at lineup-save time, but were rated ~42.0 / ~44.0 after the result was
recorded. The pre-game snapshot is the value we want preserved — it is the
rating used to balance the teams, and changing it after the fact breaks the
mental model that "this is the rating you played at."

## Root cause

At result-recording time, `ResultModal.handleSubmit` recomputes the team
ratings from the names stored in `scheduledWeek.teamA` / `teamB`
(`components/ResultModal.tsx:253-254`) and passes those recomputed values
to `record_result`, overwriting the snapshot saved earlier by `save_lineup`.

The recompute drifts from the lineup-save value for two distinct reasons:

1. **Calendar rustiness is silently lost.**
   `wprScore` applies a ×0.88 rustiness penalty to players inactive >28
   calendar days, but only when `Player.lastPlayedWeekDate` is set. That
   field is enriched just-in-time inside `NextMatchCard.handleAutoPick`
   (`components/NextMatchCard.tsx:228-232`) and is never persisted. The
   `allPlayers` array passed to `ResultModal` does not have it set, so
   previously-rusty players score higher at result-recording than they did
   at lineup-save.

2. **Guest / new-player `wprOverride` is lost.**
   `resolvePlayersForAutoPick` assigns each guest / new player a
   `wprOverride` derived from a strength hint (p25 / p50 / p75). At
   result-recording, `ResultModal.resolveTeam`
   (`components/ResultModal.tsx:232-251`) builds a fresh synthetic Player
   with no `wprOverride` and `played: 0, recentForm: ''`, producing a
   different baseline.

Either is enough to swing one team's rating by a couple of points.

## Approach

**Stop recomputing the rating at result-recording time. Use the snapshot
already stored on `scheduledWeek` from `save_lineup`.**

Considered alternatives:

- **A. Client-side only** — `ResultModal` passes
  `scheduledWeek.team_a_rating` / `team_b_rating` straight through to
  `record_result`, the public-mode `fetch`, and `buildResultShareText`.
- **B. Server-side preserve** — modify `record_result` so that when
  `p_team_a_rating IS NULL` it keeps the existing column. Defense in depth,
  but a new migration for a one-line client fix.
- **C. Both A and B.**

**Recommend A.** The client already holds the snapshot in `scheduledWeek`
and needs it for the share-text builder anyway. No migration, no RPC
behavior change, smallest blast radius.

## Changes

### `components/ResultModal.tsx`

In the non-DNF branch (around line 253), replace the recompute with the
snapshot, falling back to recomputation only when no snapshot exists:

```ts
const snapshotA = scheduledWeek.team_a_rating
const snapshotB = scheduledWeek.team_b_rating

// Fallback: lineups saved before the rating-snapshot feature (pre-2026-03-30)
// won't have a snapshot. Preserve current behavior for those.
const teamAScore =
  snapshotA ?? parseFloat(ewptScore(resolveTeam(scheduledWeek.teamA)).toFixed(3))
const teamBScore =
  snapshotB ?? parseFloat(ewptScore(resolveTeam(scheduledWeek.teamB)).toFixed(3))
```

Everything downstream (`syntheticWeek`, `buildResultShareText`, the
`record_result` RPC call, the public-mode `fetch`) keeps using
`teamAScore` / `teamBScore` and inherits the fix automatically.

The `resolveTeam` helper and its guest/new-player synthesis stay in place
to support the fallback path for legacy lineups.

### Database

No migration. `record_result` and the `/api/public/league/[id]/result`
route already write whatever the client sends; with this fix they receive
the snapshot.

### Backfill

None. Already-drifted rows (e.g. the recent example) had their original
snapshot overwritten when `record_result` ran, so the lineup-save value
can't be reconstructed exactly. Affected weeks remain as-is and can be
re-edited manually through the existing admin edit flow if desired. This
matches precedent from `20260427000002_dnf_preserve_ratings.sql`, which
also declined to backfill prior rows.

## Tests

In `components/__tests__/` (new file, or co-located):

1. **Snapshot path.** Render `ResultModal` with a `scheduledWeek` whose
   `team_a_rating` and `team_b_rating` are set. Mount with `allPlayers`
   whose recompute would produce different values. Submit. Assert the
   `record_result` RPC mock was called with the snapshot values verbatim.

2. **Fallback path.** Same setup, but `team_a_rating` and `team_b_rating`
   are `null` on `scheduledWeek`. Assert the RPC was called with the
   recomputed value (legacy lineups continue to work).

`lib/__tests__/utils.wpr.test.ts` and any `ewptScore` tests need no
changes — the formula is not being touched.

## Files touched

| File | Change |
|---|---|
| `components/ResultModal.tsx` | Use `scheduledWeek.team_a_rating` / `team_b_rating` snapshots; recompute only as fallback. |
| `components/__tests__/ResultModal.*` | Two tests: snapshot path, fallback path. |

## Out of scope

- Resetting / re-snapshotting previous weeks. The user opted to defer this.
- Persisting `lastPlayedWeekDate` or `wprOverride` so recomputation is
  deterministic. Unnecessary once we stop recomputing.
- Any change to `record_result`, `edit_week`, or the public result route.
