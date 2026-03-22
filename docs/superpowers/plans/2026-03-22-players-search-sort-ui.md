# Players Search & Sort UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the floating search input and `<select>` sort control on the players page with a grouped toolbar card, pill sort buttons, and an explicit direction toggle button.

**Architecture:** All changes are contained in a single component file — `components/PublicPlayerList.tsx`. The existing state (`sortBy`, `sortAsc`, `searchQuery`) is unchanged; only the JSX markup and imports are updated.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS v3, `lucide-react` for icons, `cn()` from `lib/utils` for conditional class merging.

---

## Files

| File | Action |
|---|---|
| `components/PublicPlayerList.tsx` | Modify — replace search + sort markup |

No new files. No new dependencies.

---

### Task 1: Add the toolbar card wrapper and search input with icon

**Files:**
- Modify: `components/PublicPlayerList.tsx`

This task replaces the bare `<input>` with a search input inside a relative wrapper (for the icon), wrapped in the toolbar card container. The sort controls are left as-is for now (replaced in Task 2).

- [ ] **Step 1: Add `Search` to the lucide-react import**

Open `components/PublicPlayerList.tsx`. The file currently imports nothing from `lucide-react`. Add the import at the top:

```tsx
import { Search } from 'lucide-react'
```

- [ ] **Step 2: Replace the search input markup**

Find this block:

```tsx
{/* Search */}
<input
  type="search"
  placeholder="Search players…"
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
  aria-label="Search players"
/>
```

Replace it with a toolbar card wrapping the search input. Leave a `{/* Sort — replaced in Task 2 */}` placeholder comment where the sort row will go:

```tsx
{/* Toolbar card */}
<div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
  {/* Search */}
  <div className="relative">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
    <input
      type="search"
      placeholder="Search players…"
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      className="bg-slate-900 border border-slate-600 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 w-full"
      aria-label="Search players"
    />
  </div>

  {/* Sort — replaced in Task 2 */}
</div>
```

- [ ] **Step 3: Delete the old sort block**

Remove the entire old sort `<div>` that follows the search input (the one with the `<label>`, `<select>`, and direction `<button>`):

```tsx
{/* Sort */}
<div className="flex items-center gap-2">
  <label htmlFor="pub-sort" className="text-xs text-slate-400 shrink-0">Sort by</label>
  <select
    id="pub-sort"
    value={sortBy}
    onChange={(e) => {
      const key = e.target.value as SortKey
      setSortBy(key)
      setSortAsc(key === 'name')
    }}
    className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm"
  >
    {SORT_OPTIONS.map((opt) => (
      <option key={opt.value} value={opt.value}>{opt.label}</option>
    ))}
  </select>
  {sortBy !== 'name' && (
    <button
      type="button"
      onClick={() => setSortAsc((a) => !a)}
      className="text-xs text-slate-400 hover:text-slate-300 shrink-0"
    >
      {sortAsc ? '↑ Low to high' : '↓ High to low'}
    </button>
  )}
</div>
```

- [ ] **Step 4: Verify visually**

Run the dev server (`npm run dev`) and open the players page. You should see:
- A toolbar card containing only the search input with a magnifying glass icon on the left
- No sort controls yet (they were removed; Task 2 adds them back)
- Player cards still render and search still filters correctly

- [ ] **Step 5: Commit**

```bash
git add components/PublicPlayerList.tsx
git commit -m "feat: add toolbar card and search icon to players list"
```

---

### Task 2: Add sort pill buttons and direction toggle

**Files:**
- Modify: `components/PublicPlayerList.tsx`

This task fills in the `{/* Sort — replaced in Task 2 */}` placeholder with pill buttons and a direction toggle button.

- [ ] **Step 1: Add `ArrowUp` and `ArrowDown` to the lucide-react import**

The import currently reads:

```tsx
import { Search } from 'lucide-react'
```

Update it to:

```tsx
import { Search, ArrowUp, ArrowDown } from 'lucide-react'
```

- [ ] **Step 2: Add `cn` to the imports**

The file does not currently import `cn`. Add it:

```tsx
import { cn } from '@/lib/utils'
```

- [ ] **Step 3: Add a direction label helper above the component**

Place this helper constant directly above the `PublicPlayerList` function (after `sortPlayers`). It maps each `SortKey` + `sortAsc` value to a display label:

```tsx
const DIRECTION_LABELS: Record<SortKey, [string, string]> = {
  name:       ['A–Z',        'Z–A'],
  played:     ['Low–High',   'High–Low'],
  won:        ['Low–High',   'High–Low'],
  winRate:    ['Low–High',   'High–Low'],
  recentForm: ['Worst–Best', 'Best–Worst'],
}
// Index 0 = sortAsc true, index 1 = sortAsc false
```

- [ ] **Step 4: Replace the sort placeholder with the sort row**

Find the placeholder comment inside the toolbar card:

```tsx
  {/* Sort — replaced in Task 2 */}
```

Replace it with the divider and sort row:

```tsx
  {/* Divider */}
  <div className="border-t border-slate-700 -mx-3 my-3" />

  {/* Sort */}
  <div role="group" aria-label="Sort by" className="flex items-center gap-2 flex-wrap">
    <span aria-hidden="true" className="text-[10px] text-slate-500 uppercase tracking-widest shrink-0">
      Sort
    </span>
    {SORT_OPTIONS.map((opt) => (
      <button
        key={opt.value}
        type="button"
        aria-pressed={sortBy === opt.value}
        onClick={() => {
          if (sortBy === opt.value) return
          setSortBy(opt.value)
          setSortAsc(opt.value === 'name')
        }}
        className={cn(
          'rounded-full text-xs px-2.5 py-1 transition-colors',
          sortBy === opt.value
            ? 'bg-sky-500 border border-sky-500 text-white hover:bg-sky-400'
            : 'border border-slate-700 text-slate-400 hover:border-slate-500',
        )}
      >
        {opt.label}
      </button>
    ))}
    <button
      type="button"
      onClick={() => setSortAsc((a) => !a)}
      className="ml-auto shrink-0 text-xs text-slate-400 bg-slate-900 border border-slate-700 rounded-md px-2 py-1 flex items-center gap-1 hover:border-slate-500 transition-colors"
    >
      {sortAsc
        ? <ArrowUp className="h-3.5 w-3.5" />
        : <ArrowDown className="h-3.5 w-3.5" />
      }
      {DIRECTION_LABELS[sortBy][sortAsc ? 0 : 1]}
    </button>
  </div>
```

- [ ] **Step 5: Verify visually**

With the dev server running, open the players page and check:

1. **Toolbar card** — search + sort appear as one grouped unit, clearly distinct from the player rows below
2. **Search icon** — magnifying glass visible on the left of the input
3. **Sort pills** — all five options render (`Name`, `Games Played`, `Won`, `Win Rate`, `Recent Form`); active pill is sky blue
4. **Direction button** — sits at the far right of the sort row; shows `ArrowUp` + "A–Z" by default (name, ascending)
5. **Switching sort keys** — clicking `Won` makes it active and direction button shows `ArrowDown` + "High–Low" (descending default)
6. **Direction toggle** — clicking the direction button flips icon and label; player order changes accordingly
7. **Active pill is no-op** — clicking the already-selected pill does not change sort or direction
8. **Search still works** — typing in the search box filters players correctly

- [ ] **Step 6: Commit**

```bash
git add components/PublicPlayerList.tsx
git commit -m "feat: replace sort select with pill buttons and direction toggle"
```
