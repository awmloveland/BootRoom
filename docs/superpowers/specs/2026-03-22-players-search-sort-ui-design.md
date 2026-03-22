# Players Page — Search & Sort UI Redesign

**Date:** 2026-03-22
**Status:** Approved
**Scope:** `components/PublicPlayerList.tsx` only

---

## Problem

The search input and sort controls on the players page use the same visual treatment as the player rows (`bg-slate-800 border border-slate-700`), making them blend into the list. The sort row appears to float with no clear visual anchor. There is no magnifying glass icon on the search input.

---

## Solution

Wrap the search input and sort row in a single **toolbar card**, replace the sort `<select>` with **pill buttons**, and add a **direction toggle button** at the far end of the sort row.

---

## Design

### Toolbar card

Both the search input and sort row live inside one container:

```
bg-slate-800  border border-slate-700  rounded-xl  p-3  mb-3
```

A `border-t border-slate-700` divider separates the search input from the sort row. This groups the controls into a single visual unit distinct from the individual player cards below (which share the same colours but are separate rows).

### Search input

- Add a `Search` icon from `lucide-react` positioned absolutely on the left of the input
- Input background: `bg-slate-900` (recedes inside the `bg-slate-800` toolbar)
- Input border: `border-slate-700`, focus ring: `ring-2 ring-sky-500`
- Padding adjusted to accommodate the icon: `pl-9`

### Sort pills

Replace the `<select>` with a row of `<button>` elements rendered from `SORT_OPTIONS`.

- Sort label: `text-[10px] text-slate-500 uppercase tracking-widest` — `"SORT"`
- Inactive pill: `border border-slate-700 text-slate-400 rounded-full text-xs px-2.5 py-1 hover:border-slate-500`
- Active pill: `bg-sky-500 border-sky-500 text-white rounded-full text-xs px-2.5 py-1`
- Clicking an inactive pill sets the sort key and resets direction: ascending for `name`, descending for all other keys (higher values are more interesting by default)
- Clicking the already-active pill does nothing (direction is changed via the direction button)

### Direction button

- Position: `ml-auto` at the far end of the sort row
- Content: `ArrowUp` or `ArrowDown` icon (14×14) from `lucide-react` + a short text label
- Labels by sort key:
  - `name` → "A–Z" / "Z–A"
  - `played`, `won`, `winRate` → "High–Low" / "Low–High"
  - `recentForm` → "Best–Worst" / "Worst–Best"
- Style: `text-xs text-slate-400 bg-slate-900 border border-slate-700 rounded-md px-2 py-1 flex items-center gap-1 hover:border-slate-500`
- Visible for all sort keys
- Clicking it toggles `sortAsc`

---

## State changes

No new state is introduced. The existing `sortBy`, `sortAsc`, and `searchQuery` state in `PublicPlayerList` are sufficient. The only behavioural change is the default direction when switching sort keys (descending for non-name keys).

---

## Files changed

| File | Change |
|---|---|
| `components/PublicPlayerList.tsx` | Replace search + sort markup; add toolbar card, icon, pills, direction button |

No other files are affected. No new dependencies are introduced (`lucide-react` and `cn` are already available).

---

## Out of scope

- Player card styling
- Any changes to sort logic beyond the direction default
- Mobile-specific layout changes (the toolbar wraps naturally on small screens)
