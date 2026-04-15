# Result Share — Most-Recent Card Revision

**Date:** 2026-04-15
**Branch:** awmloveland/result-share-stats
**Supersedes:** `2026-04-10-result-share-design.md` (Section B: retrospective share on MatchCard)

---

## Overview

The original design stored computed highlights in the `notes` field (`[user notes]\n\n[highlights]`) and placed a share button on every played `MatchCard`. This is being revised: notes is a user-only field, and the retrospective share button appears **only on the most recently resulted game**, available to all members.

The `ResultSuccessPanel` (immediate post-save share) is **unchanged**.

---

## What Changes

### Removed
- Highlights appended to `notes` at save time
- `\n\n` split display logic in `PlayedCard`
- Share button on all played `MatchCard`s

### Added
- Share button on the most recently resulted `MatchCard` only
- Full rich share text computed live via `buildResultShareText()` (same output as `ResultSuccessPanel`)

### Unchanged
- `ResultSuccessPanel` and its share flow
- `buildResultShareText()` utility function
- `ResultModal` highlight computation (still needed for `ResultSuccessPanel`)
- Notes field display (reverts to simple italic user text)

---

## Data Layer

### `ResultModal` — notes write

Remove `highlightsText` append. Write only user-typed notes to DB:

```ts
// Before
const combinedNotes = notes.trim() ? notes.trim() + '\n\n' + highlightsText : highlightsText
// ... upsert with combinedNotes

// After
// ... upsert with notes.trim()
```

`buildResultShareText()` is still called to get `shareText` and `highlightsText` for `ResultSuccessPanel` — no other change to `ResultModal`.

### Week 29 cleanup

One-off SQL to remove the backfilled highlights from week 29:

```sql
UPDATE weeks SET notes = NULL WHERE week = 29 AND game_id = '<league-game-id>';
```

(No user notes were present — the backfill wrote only auto-generated highlights. Filter by `game_id` to avoid touching week 29 in other leagues.)

---

## Component Changes

### `WeekList`

Currently passes `leagueName` and `shareGameId` to every `MatchCard`. Change to conditional: only the most recently resulted card receives the share props.

`WeekList` already computes `mostRecent`. Make `leagueName`, `shareGameId`, and the new `weeks` prop conditional on the most recent card. `allPlayers` is already passed unconditionally (needed for admin result editing) — leave it as-is:

```tsx
// Only for the most recently resulted card:
leagueName={week.week === mostRecent?.week ? leagueName : undefined}
shareGameId={week.week === mostRecent?.week ? gameId : undefined}
weeks={week.week === mostRecent?.week ? weeks : undefined}
// allPlayers already passed unconditionally — no change needed
```

No other `WeekList` changes.

### `MatchCard` / `PlayedCard`

**New prop:** `weeks?: Week[]`

**Share button gating:** Render when `leagueName && shareGameId && weeks` are all present (naturally only the most recently resulted card). No `isAdmin` check — available to all members.

**Share content:** Replace inline `buildRetroShareText()` with a call to `buildResultShareText()`:

```ts
import { buildResultShareText } from '@/lib/utils'

// Inside handleShare:
const { shareText } = buildResultShareText({
  leagueName,
  leagueId: shareGameId,
  week: week.week,
  date: week.date,
  format: week.format ?? '',
  teamA: week.teamA ?? [],
  teamB: week.teamB ?? [],
  winner: week.winner!,
  goalDifference: week.goal_difference ?? 0,
  teamARating: week.team_a_rating ?? 0,
  teamBRating: week.team_b_rating ?? 0,
  players: allPlayers,
  weeks,  // already contains this played week — no synthetic construction needed
})
```

**Notes display:** Remove `\n\n` split logic. Revert to simple display:

```tsx
{week.notes?.trim() && (
  <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-2 text-xs text-slate-400 italic w-full">
    {week.notes.trim()}
  </div>
)}
```

**Share mechanism:** Unchanged — `navigator.share` on mobile (`window.innerWidth < 768`), clipboard + "Copied!" toast on desktop.

---

## Files Affected

| File | Change |
|---|---|
| `components/ResultModal.tsx` | Remove `highlightsText` append to notes before DB write |
| `components/MatchCard.tsx` | Add `weeks?` prop; revert notes display; update share gating, button visibility (all members), and share text |
| `components/WeekList.tsx` | Pass share props only to most-recently-resulted card |
| SQL (one-off) | `UPDATE weeks SET notes = NULL WHERE week = 29` |

---

## Share Mechanism

```ts
if (navigator.share && window.innerWidth < 768) {
  await navigator.share({ text })
} else {
  await navigator.clipboard.writeText(text)
  // show "Copied!" toast for 2s
}
```

---

## What Is Not In Scope

- Retrospective share on any game other than the most recently resulted
- Changing `ResultSuccessPanel` or its share flow
- Storing highlights anywhere in the DB
- Share button visibility differences between admin and member roles (both see it)
