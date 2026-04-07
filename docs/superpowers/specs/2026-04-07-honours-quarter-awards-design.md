# Honours Quarter Awards — Design Spec

**Date:** 2026-04-07
**Branch:** `awmloveland/honours-quarter-awards`

---

## Overview

Add a horizontal scrollable row of personal award chips above the standings table inside each completed quarter card on the Honours tab. Awards highlight notable individual performances for the quarter and appear only when the card is expanded.

---

## Awards

Up to 7 chips per quarter. The champion chip is always first; all others are conditional and hidden if no player qualifies.

| Key | Nickname | Icon | Rule | Minimum |
|---|---|---|---|---|
| `champion` | Champion | 🏅 | Top of the standings (highest points) | Always shown |
| `iron_man` | Iron Man | ⚽ | Most games played | No minimum |
| `win_machine` | Win Machine | 🏆 | Most wins | Must have ≥1 win |
| `sharp_shooter` | Sharp Shooter | ⚡ | Highest points per game | ≥3 games played |
| `clutch` | Clutch | 🎯 | Highest win rate | ≥3 games played, ≥1 win |
| `untouchable` | Untouchable | 🛡️ | Zero losses | ≥3 games played |
| `on_fire` | On Fire | 🔥 | Longest consecutive win streak in the quarter | ≥2 consecutive wins |

Ties are broken by taking the earlier-ranked entry in the standings (i.e. more points → more wins → alphabetical).

---

## Layout

- **Position:** Inside the collapsible content of each `QuarterCard`, between the card header and the standings table.
- **Visibility:** Only when the card is expanded. Not shown in the collapsed state.
- **Chip layout:** Horizontal flex row with `overflow-x: auto` and `scrollbar-hide`. Chips are fixed-width (`min-w-[108px]`) so partial chips are visible on mobile, hinting the row is scrollable.
- **Empty awards:** Chips with no winner are omitted entirely. The row is not rendered if `awards.length === 0` (edge case: a quarter with only 1 player and no win streak).

### Chip anatomy

```
[icon]  NICKNAME          ← 10px uppercase indigo-400
Player Name               ← 12px semibold slate-100
stat value                ← 10px slate-500
```

Background: `bg-slate-900`, border: `border-slate-700`, rounded-lg, `px-2.5 py-2`.

---

## Implementation approach

**Option 1 — Extend `computeAllCompletedQuarters`** (chosen).

All award computation lives in `lib/sidebar-stats.ts`, co-located with the existing quarterly standings logic. No new fetchers or data-pipeline changes required.

---

## Types

Add to `lib/types.ts`:

```ts
export interface QuarterAward {
  key: 'champion' | 'iron_man' | 'win_machine' | 'sharp_shooter' | 'clutch' | 'untouchable' | 'on_fire';
  nickname: string;
  icon: string;
  player: string;
  stat: string;  // pre-formatted, e.g. "2.3 PPG", "5-game streak"
}
```

Add `awards: QuarterAward[]` to `CompletedQuarter` in `lib/types.ts`.

---

## Computation (`lib/sidebar-stats.ts`)

Add a `buildQuarterAwards(entries, weekSlice)` helper called from within `computeAllCompletedQuarters` after entries are sorted.

- `entries: QuarterlyEntry[]` — sorted standings for the quarter
- `weekSlice: Week[]` — only the played weeks belonging to this quarter (needed for win streak)

Add a `longestWinStreak(weeks)` helper that iterates weeks in date order and tracks each player's consecutive win count, returning `{ player: string, count: number }`.

Add a `maxBy<T>(arr: T[], fn: (item: T) => number): T | undefined` utility (3 lines) — returns the array item with the highest value for the selector. Lives in `lib/sidebar-stats.ts` (not exported; internal use only).

---

## UI (`components/HonoursSection.tsx`)

`QuarterCard` gains an `awards: QuarterAward[]` prop.

Inside the `Collapsible.Content`, above the table:

```tsx
{awards.length > 0 && (
  <div className="flex gap-2 overflow-x-auto px-3 py-2.5 border-b border-slate-700 scrollbar-hide">
    {awards.map(award => (
      <div key={award.key} className="flex-shrink-0 flex flex-col gap-0.5 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 min-w-[108px]">
        <div className="flex items-center gap-1.5">
          <span className="text-xs">{award.icon}</span>
          <span className="text-[10px] font-bold tracking-wide uppercase text-indigo-400">
            {award.nickname}
          </span>
        </div>
        <span className="text-xs font-semibold text-slate-100">{award.player}</span>
        <span className="text-[10px] text-slate-500">{award.stat}</span>
      </div>
    ))}
  </div>
)}
```

Add `scrollbar-hide` to `app/globals.css`:

```css
.scrollbar-hide { scrollbar-width: none; }
.scrollbar-hide::-webkit-scrollbar { display: none; }
```

---

## Files changed

| File | Change |
|---|---|
| `lib/types.ts` | Add `QuarterAward` interface; add `awards` field to `CompletedQuarter` |
| `lib/sidebar-stats.ts` | Add `buildQuarterAwards`, `longestWinStreak`, `maxBy`; call from `computeAllCompletedQuarters` |
| `components/HonoursSection.tsx` | Add `awards` prop to `QuarterCard`; render awards row inside collapsible content |
| `app/globals.css` | Add `.scrollbar-hide` utility |
