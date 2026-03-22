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

### Context

The component's existing outer wrapper is `<div className="flex flex-col gap-3">`. The page background is `bg-slate-900`. The toolbar card's `bg-slate-800` contrasts correctly against the page background, and its `gap-3` spacing already separates it from the player cards below — no `mb-*` is needed on the toolbar card itself.

### Toolbar card

Both the search input and sort row live inside one container replacing the current two separate elements:

```
bg-slate-800  border border-slate-700  rounded-xl  p-3
```

A standalone `<div className="border-t border-slate-700 -mx-3 my-3" />` sits between the search wrapper and the sort row as a full-bleed divider.

### Search input

- Wrap the `<input>` in a `relative` container; place a `Search` icon from `lucide-react` absolutely at `left-3 top-1/2 -translate-y-1/2`, size `h-3.5 w-3.5 text-slate-500 pointer-events-none`
- Input: `bg-slate-900 border border-slate-600 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 w-full`
- `border-slate-600` (vs the card's `border-slate-700`) gives the input visual definition inside the card

### Sort pills

The existing `SORT_OPTIONS` array in the file is **unchanged** — use it as-is:

```ts
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name',       label: 'Name' },
  { value: 'played',     label: 'Games Played' },
  { value: 'won',        label: 'Won' },
  { value: 'winRate',    label: 'Win Rate' },
  { value: 'recentForm', label: 'Recent Form' },
]
```

Replace the `<select>` with `<button>` elements rendered from `SORT_OPTIONS`. Use `opt.label` directly for each pill text. `flex-wrap` on the row handles overflow.

- Wrap the row in: `<div role="group" aria-label="Sort by" className="flex items-center gap-2 flex-wrap">`
- Decorative label: `<span aria-hidden="true" className="text-[10px] text-slate-500 uppercase tracking-widest shrink-0">Sort</span>`
- Each pill: `<button type="button" aria-pressed={sortBy === opt.value} className={cn(...)}>`
- Use `cn()` from `lib/utils` for all conditional class merging — never string concatenation
- Inactive pill: `border border-slate-700 text-slate-400 rounded-full text-xs px-2.5 py-1 hover:border-slate-500 transition-colors`
- Active pill: `bg-sky-500 border-sky-500 text-white rounded-full text-xs px-2.5 py-1 hover:bg-sky-400 transition-colors`
- Clicking an inactive pill: set `sortBy` to that key; reset `sortAsc` — `true` for `name`, `false` for all others. When clicking `recentForm`, the initial presentation is descending ("Best–Worst"), showing the highest-performing players first.
- Clicking the already-active pill: **no-op** — the direction button is the only way to change direction once a key is selected

### Direction button

The icon and label reflect the **current** sort direction (not what clicking will do next).

- Position: `ml-auto shrink-0` at the far end of the sort row `<div>`
- Icon: `ArrowUp` (from `lucide-react`, `h-3.5 w-3.5`) when `sortAsc === true`; `ArrowDown` when `sortAsc === false`
- The label table below is exhaustive — it covers every value in `SORT_OPTIONS`:

  | `sortBy`      | `sortAsc: true` | `sortAsc: false` |
  |---|---|---|
  | `name`        | A–Z             | Z–A              |
  | `played`      | Low–High        | High–Low         |
  | `won`         | Low–High        | High–Low         |
  | `winRate`     | Low–High        | High–Low         |
  | `recentForm`  | Worst–Best      | Best–Worst       |

- Style: `text-xs text-slate-400 bg-slate-900 border border-slate-700 rounded-md px-2 py-1 flex items-center gap-1 hover:border-slate-500 transition-colors`
- Visible for all sort keys
- Clicking it toggles `sortAsc`; operates independently — clicking the active pill always remains a no-op regardless of current `sortAsc` value

---

## State changes

No new state is introduced. The existing `sortBy`, `sortAsc`, and `searchQuery` are sufficient. The only behavioural change: when switching sort keys, `sortAsc` defaults to `false` for all non-`name` keys (including `recentForm`).

---

## Files changed

| File | Change |
|---|---|
| `components/PublicPlayerList.tsx` | Replace search input and sort `<select>` markup with toolbar card, search icon, pill buttons, and direction toggle button |

No other files are affected. No new dependencies (`lucide-react` and `cn` are already in use in the file).

---

## Out of scope

- Player card styling
- Any changes to sort logic beyond the direction default
- Mobile-specific layout changes (the toolbar wraps naturally via `flex-wrap`)
