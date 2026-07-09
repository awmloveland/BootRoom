# Quarter Wrap Celebration — Design

**Date:** 2026-07-09
**Status:** Approved (pending spec review)

## Summary

When a calendar quarter ends and its champion + honours are known, BootRoom
should mark the moment with a celebratory "Champion + Awards Reel" experience.
The same reel appears on two surfaces:

- **Surface A — the admin moment:** when an admin records the game that
  *clinches* a quarter, the final step of the result-recording flow becomes the
  celebration instead of the normal per-game share.
- **Surface B — the Results-tab card:** a self-expiring card at the top of the
  Results tab, shown to everyone while the just-finished quarter is the freshest
  one, disappearing the moment the first game of the new quarter is recorded.

No new data model is introduced. Champion and awards are already computed
server-side; this feature is a new presentation layer plus a small
"did a quarter just complete?" detection helper.

## Background — what already exists

- **Quarters are calendar-based** (Q1–Q4), derived at runtime in
  `lib/sidebar-stats.ts`. There is no quarter/champion table.
- `computeAllQuarters(weeks, now)` returns `HonoursYear[]` of `QuarterSummary`
  objects. A completed quarter carries `entries` (standings), `awards`
  (`champion`, `iron_man`, `win_machine`, `sharp_shooter`, `clutch`,
  `untouchable`, `on_fire`), `seasonName`, `dateRange`, and `gamesPlayed`.
- A quarter is `completed` when the calendar is past its end, all its weeks are
  settled (no `unrecorded`/`scheduled`), and at least one week is `played`.
- The **Honours tab** (`components/HonoursSection.tsx`) already renders completed
  quarters with an awards strip, standings, and a **"Share the glory"** button
  that calls `buildQuarterShareText()` + `shareOrCopy()` and deep-links to
  `#q-{year}-{q}`.
- The **ResultModal** (`components/ResultModal.tsx`) records a game through steps
  `winner → review → confirm → share`; the `share` step shows per-game highlights.
- The **sidebar** already has a "holdover" concept (`isHoldover`, `lastChampion`
  in `computeQuarterlyTable`): when the current calendar quarter has no played
  games, it displays the previous quarter as final. This is the exact signal
  Surface B keys off.

## Chosen approach (decisions locked in brainstorming)

- **Content depth:** treatment B — Champion hero + full awards reel in one card
  (not champion-only, not a multi-beat story).
- **Admin moment:** A1 — the celebration *replaces* the share step when the
  recorded game clinches a quarter (rather than adding an extra step).
- **Results card lifecycle:** B2 — self-expiring, tied to "current quarter has no
  recorded results yet." No dismiss button, no timers, no dismissal state.
- **Audience:** feature-flagged, promotable all the way to public.

## Components

### `QuarterCelebration` (new, `components/QuarterCelebration.tsx`)

Single presentational component reused by both surfaces (and available to align
the Honours tab share styling later).

**Props:**

```ts
interface QuarterCelebrationProps {
  quarter: QuarterSummary        // must be a completed quarter with entries + awards
  leagueName: string
  leagueSlug: string
  variant: 'modal' | 'card'      // framing only; content is identical
}
```

**Renders (top to bottom):**

1. Crown + `👑 {seasonName} Champion` label with `Q{q} {year}` context.
2. Champion name from `quarter.entries[0]` plus a one-line record
   (`{points} pts · {won} wins · {drew} draws`).
3. Awards reel from `quarter.awards`, **excluding** the `champion` award (it is
   the hero). Each medal shows icon, nickname, player, and stat — mirroring the
   Honours awards strip.
4. **"Share the glory"** button → `buildQuarterShareText({ leagueName,
   leagueSlug, quarter })` → `shareOrCopy(text)`; on `'copied'` shows the
   existing brag toast ("Copied — go and brag 📣").

**Styling:** Tailwind utility classes only, dark-slate palette, CSS-only
confetti/sheen (no animation library). `variant` controls outer framing:
`'modal'` fills the dialog step; `'card'` renders a bordered `bg-slate-800` card
with a link to the Honours deep-link (`/{leagueSlug}/honours#q-{year}-{q}`) for
full standings.

Champion accent may use the amber/gold treatment already used by the sidebar
champion badge (`StatsSidebar.tsx`), which is the established exception to the
"no yellow/orange" rule for the champion motif.

### Clinch-detection helper (new, in `lib/sidebar-stats.ts`)

```ts
// Returns the quarter that transitioned to `completed` between two week sets,
// or null if none did. Used to decide whether recording a game clinched a quarter.
export function findNewlyCompletedQuarter(
  weeksBefore: Week[],
  weeksAfter: Week[],
  now: Date,
): QuarterSummary | null
```

Implementation: compute the set of `completed` quarter keys (`{year}-{q}`) from
`computeAllQuarters(weeksBefore, now)` and from `computeAllQuarters(weeksAfter,
now)`; return the `QuarterSummary` for the single key present in *after* but not
*before* (with a champion). If more than one appears, return the most recent.

## Surface A — the admin moment

- `ResultStep` in `ResultModal.tsx` gains `'celebrate'`. Flow becomes
  `winner → review → confirm → (celebrate | share)`.
- After a successful save, the modal computes `findNewlyCompletedQuarter(before,
  after, now)`. If it returns a quarter, the modal routes to the `'celebrate'`
  step rendering `QuarterCelebration variant="modal"` for that quarter; otherwise
  it routes to the existing `'share'` step unchanged.
- The modal needs the full weeks list (before and after the save) to run the
  helper. The page already holds weeks; pass them (or a callback that returns the
  updated set) into the modal.
- Admins bypass feature flags, so this always fires for the recording admin
  regardless of flag state. This is intended — the person who records the
  clinching game always gets the moment.

## Surface B — the Results-tab card

- Rendered at the top of `app/[slug]/results/page.tsx`, above the match list, as
  `QuarterCelebration variant="card"`.
- **Show condition:** the current calendar quarter has **zero played weeks**
  *and* the previous quarter is `completed` with a champion — the existing
  holdover signal. When the first game of the new quarter is recorded, the
  current quarter gains a played week and the card disappears. No timers, no
  dismissal state.
- Applies on both the member and public branches of the results page (subject to
  the feature flag below).

## Feature flag

New `FeatureKey: 'quarter_celebration'`.

- Add to the `FeatureKey` union in `lib/types.ts`.
- Add a `DEFAULT_FEATURES` entry in
  `app/api/league/[id]/features/route.ts` with `enabled: false,
  public_enabled: false`.
- Wire it into `FeaturePanel.tsx`.
- Seed migration adds the `league_features` row for existing leagues.

Gating:

- **Surface B (Results card)** is gated with
  `isFeatureEnabled(features, 'quarter_celebration', resolveVisibilityTier(role))`.
  Members see it once **enabled**; the public results page shows it once
  **public_enabled**; admins always see it.
- **Surface A (admin moment)** is not flag-gated — admins bypass flags, which is
  the desired behaviour.

## Reuse & non-goals

- Reuses `computeAllQuarters`, `buildQuarterAwards`, `QuarterSummary`,
  `buildQuarterShareText`, `shareOrCopy`, and the `#q-{year}-{q}` deep-link.
- **No new data model**, no new share text format, no changes to how champions or
  awards are computed.
- **Not** building the multi-beat "story" experience (treatment C) — deferred.
- **Not** adding a per-user dismissal mechanism — self-expiry only.

## Testing

- Unit-test `findNewlyCompletedQuarter` alongside
  `lib/__tests__/sidebar-stats.quarters.test.ts`: recording the last unrecorded
  week of a calendar-past quarter returns that quarter; recording a game in the
  current quarter returns null; calendar rollover with no new recording is not
  this helper's concern (Surface B covers it).
- The shared share button reuses `buildQuarterShareText` /`shareOrCopy`, already
  covered by `lib/__tests__/utils.quarterShare.test.ts` and
  `utils.shareOrCopy.test.ts`.
- Component render tests for `QuarterCelebration` (champion hero present, champion
  award excluded from the reel, share button wired) if the repo has component
  test infrastructure; otherwise rely on the unit + existing share coverage.
