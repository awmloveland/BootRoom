# Player Card Redesign

**Date:** 2026-04-08
**Status:** Approved

---

## Overview

Redesign the expanded body of `PlayerCard` to replace the plain 2-column label/value grid with a visually engaging layout using proportional bar charts, coloured stat blocks, and a cleaner information hierarchy.

No changes to the collapsed header (player name, mentality pill, sort metric, chevron), the toolbar, or `PublicPlayerList`.

---

## Layout — Expanded Body

The expanded body has three sections stacked vertically, separated by `border-slate-700` dividers.

### Section 1 — Key stats row

Three items across the full width:

| Position | Label | Value |
|---|---|---|
| Left | `WIN RATE` | Large bold number in `text-sky-400` e.g. `57.1%` |
| Right-centre | `PLAYED` (right-aligned) | Large bold number in `text-slate-100` e.g. `28` |
| Far right | `LAST 5` (left-aligned) | Five form circles (see below) |

**Form circles:**
- Each circle is 22×22px, `rounded-full`
- W: `bg-sky-500`, letter in `text-slate-900`
- D: `bg-slate-700`, letter in `text-slate-400`
- L: `bg-red-950`, letter in `text-red-300`
- Circles are ordered **oldest → newest left to right**
- The rightmost circle (most recent game) has a narrow `12px` wide, `2px` tall `bg-sky-400` underline centred beneath it, indicating recency

### Section 2 — Results bar

Label: `RESULTS` (muted uppercase, `text-slate-500`)

A proportional stacked horizontal bar (`8px` tall, `rounded`) with three segments in flex proportions matching W:D:L counts:
- Won segment: `bg-sky-500`
- Drawn segment: `bg-slate-600`
- Lost segment: `bg-red-500`
- 1px gap between segments

Above each segment: the count (`11px`, bold, coloured to match segment — sky/slate/red)
Below each segment: the label (`9px`, uppercase, `text-slate-500`)
- Left-aligned within each flex segment: `Won`, `Drawn`, `Lost`

### Section 3 — Team Split bar

Label: `TEAM SPLIT` (muted uppercase, `text-slate-500`)

A proportional stacked horizontal bar (`8px` tall, `rounded`) with two segments in flex proportions matching Team A : Team B appearances:
- Team A segment: `bg-blue-700`
- Team B segment: `bg-violet-700`
- 1px gap between segments

Above each segment: the count (`11px`, bold — Team A in `text-blue-300`, Team B in `text-violet-300`)
Below each segment:
- Team A: `Team A` — left-aligned, `text-slate-500`
- Team B: `Team B` — **right-aligned**, `text-slate-500`

---

## Existing `StatRow` grid

The `StatRow` component and the 2-column grid in the expanded body are **removed** and replaced entirely by the three sections above.

The `STAT_ROWS` config array and `StatRow` component can be deleted from `PlayerCard.tsx` as they will no longer be used.

---

## Form display direction change

The `recentForm` string is stored **newest-first** (index 0 = most recent). Display components reverse it to render oldest → newest left to right, so the rightmost circle = most recent. The new form circles must do the same reversal: `[...player.recentForm].reverse()`.

The underline indicator goes on the **last element** of the reversed array (index 4, rightmost circle).

`RecentForm` and `FormDots` are used elsewhere (e.g. `StatsSidebar`) and must **not** be changed.

---

## `visibleStats` and feature flag config

The existing `visibleStats` prop controls which stat rows are shown. With the grid removed, this prop has no effect on the new layout. The new layout always shows win rate, played, form, results bar, and team split — no per-stat visibility toggling.

The `visibleStats` prop can remain on `PlayerCard` for now (to avoid breaking the call sites) but can be ignored internally.

---

## Files changed

| File | Change |
|---|---|
| `components/PlayerCard.tsx` | Replace expanded body — remove `StatRow`, `STAT_ROWS`, grid; add three-section layout |

No other files need to change.

---

## Colours reference

All colours follow the existing app palette:

| Token | Usage |
|---|---|
| `text-sky-400` / `bg-sky-500` | Win rate, Won segment, form W circles, underline |
| `text-slate-100` | Played count |
| `text-slate-500` | Section labels, bar sub-labels |
| `bg-slate-700` / `text-slate-400` | Drawn segment, form D circles |
| `bg-red-950` / `text-red-300` | Form L circles |
| `bg-red-500` | Lost bar segment |
| `text-blue-300` / `bg-blue-700` | Team A |
| `text-violet-300` / `bg-violet-700` | Team B |
