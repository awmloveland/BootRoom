# Win Probability Bar — Design Spec

**Date:** 2026-03-20
**Status:** Approved

---

## Overview

Replace the current "Team Ratings" balance bar in the lineup builder with a win probability display. The bar currently shows raw EWTPI scores (0–100) with a muted "Team Ratings" label. The new design shows win probability percentages in a pundit-style format that updates live as players are dragged between teams.

---

## What Changes

### 1. Bar width calculation

**Before:** `liveScoreA / (liveScoreA + liveScoreB) * 100`
**After:** `winProbability(liveScoreA, liveScoreB) * 100`

`winProbability()` already exists in `lib/utils.ts`. It applies `1 / (1 + exp(-(scoreA - scoreB) / 8))`. No new math required.

### 2. % figures flanking the bar

Replace the small muted score labels with larger, bold, team-coloured percentages on either side of the bar.

Layout: a `flex items-center gap-2.5` row — left number, bar track (`flex-1`), right number.

- Left (Team A %): `text-[15px] font-bold tabular-nums text-sky-300`
- Right (Team B %): `text-[15px] font-bold tabular-nums text-violet-300 text-right`
- When teams are exactly even (`Math.abs(probA * 100 - 50) <= 1`): both numbers use `text-slate-400`
- Values: `Math.round(winProbA * 100)` and `Math.round((1 - winProbA) * 100)`

**Note on dynamic width:** The bar fill element uses `style={{ width: '...' }}` for the dynamic runtime percentage. This is the one case in the component where a `style` prop is unavoidable — Tailwind cannot express a runtime-derived width. This already exists in the current code and is carried forward unchanged.

### 3. Pundit-style copy replaces "Team Ratings" label

A single line of text centred below the bar (`text-center text-xs font-medium`). Determined by win probability thresholds, coloured to match the leading team (or neutral when even).

The even bucket is `Math.abs(probA * 100 - 50) <= 1` (within 1 pp of 50/50). The boundary at 51% belongs to the even bucket, not the "slight edge" bucket.

| Leading team win prob | Copy | Tailwind colour |
|---|---|---|
| ≤ 51% (even) | "Too close to call — this one could go either way" | `text-slate-400` |
| >51%–<55% | "Slight edge to [Team] going into this one" | `text-sky-400` / `text-violet-400` |
| 55%–<62% | "[Team] look like the stronger side tonight" | `text-sky-400` / `text-violet-400` |
| 62%–<70% | "[Team] are favourites heading into this one" | `text-sky-400` / `text-violet-400` |
| ≥70% | "The odds heavily favour [Team] tonight" | `text-sky-400` / `text-violet-400` |

Note: % figures use the `300` shade; copy text uses the `400` shade.

### 4. Score tags on team headers — remove

The score tags on the Team A / Team B headers (raw EWTPI scores) should be removed. The `score: number` parameter on `renderTeam` should be dropped, and both call sites must also be updated to remove the argument:

```ts
// Before
renderTeam('A', localTeamA, liveScoreA)
renderTeam('B', localTeamB, liveScoreB)

// After
renderTeam('A', localTeamA)
renderTeam('B', localTeamB)
```

### 5. Edge cases

**Both teams empty:** `winProbability(0, 0)` returns `0.5`. The bar renders 50/50 and the even copy fires. Acceptable — this state is not visible in practice since auto-pick always fills both teams before this section renders.

**One team empty during drag:** If all players are dragged to one side, `ewptScore([])` returns `0`, producing a heavily skewed bar (~100% for the populated team). This is a transient state during dragging and is acceptable behaviour — the bar will correct itself as soon as a player is dropped on the other team.

---

## What Does Not Change

- Bar track: `h-1.5 rounded-full overflow-hidden flex`, sky-600 / violet-600 fill — unchanged. No gradient.
- Bar updates live on every drag (already the case — `liveScoreA`/`liveScoreB` derived from `localTeamA`/`localTeamB` state)
- All other parts of the lineup builder UI are untouched

---

## File Affected

- `components/NextMatchCard.tsx` — the `isAutoPickMode` IIFE (team lists + balance bar)
- `lib/utils.ts` — add `winCopy()` export

---

## `winCopy` Helper

Add to `lib/utils.ts`:

```ts
export function winCopy(probA: number): { text: string; team: 'A' | 'B' | 'even' } {
  const pct = probA * 100
  const isEven = Math.abs(pct - 50) <= 1
  if (isEven) return { text: "Too close to call — this one could go either way", team: 'even' }
  const leading = pct > 50 ? 'A' : 'B'
  const leadPct = pct > 50 ? pct : 100 - pct
  const name = leading === 'A' ? 'Team A' : 'Team B'
  if (leadPct < 55) return { text: `Slight edge to ${name} going into this one`, team: leading }
  if (leadPct < 62) return { text: `${name} look like the stronger side tonight`, team: leading }
  if (leadPct < 70) return { text: `${name} are favourites heading into this one`, team: leading }
  return { text: `The odds heavily favour ${name} tonight`, team: leading }
}
```

Copy colour in the component: `team === 'A'` → `text-sky-400`, `team === 'B'` → `text-violet-400`, `team === 'even'` → `text-slate-400`.
