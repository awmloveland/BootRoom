# Player Sort Bar — Horizontal Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the wrapping sort button row in `PublicPlayerList` with a horizontally scrollable track, keeping the A-Z direction toggle pinned at the right.

**Architecture:** Single-file layout change in `components/PublicPlayerList.tsx`. The sort row outer `<div>` gains a scroll wrapper with a fade overlay pseudo-element; sort buttons and the "Sort" label move inside the scrollable track. No logic, state, or prop changes.

**Tech Stack:** React, Tailwind CSS v3, `cn()` from `lib/utils.ts`

---

### Task 1: Update the sort row layout

**Files:**
- Modify: `components/PublicPlayerList.tsx:93-129`

- [ ] **Step 1: Open the file and locate the sort row**

  In `components/PublicPlayerList.tsx`, find the sort `<div>` starting at line 93:

  ```tsx
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
          setSortAsc(DEFAULT_ASC[opt.value])
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
      aria-label="Toggle sort direction"
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

- [ ] **Step 2: Replace the sort row with the scrollable layout**

  Replace the entire block above with:

  ```tsx
  <div role="group" aria-label="Sort by" className="flex items-center gap-0.5">
    <div className="relative flex-1 overflow-hidden min-w-0 after:absolute after:right-0 after:top-0 after:bottom-0 after:w-4 after:bg-gradient-to-r after:from-transparent after:to-slate-800 after:pointer-events-none">
      <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
              setSortAsc(DEFAULT_ASC[opt.value])
            }}
            className={cn(
              'rounded-full text-xs px-2.5 py-1 transition-colors shrink-0',
              sortBy === opt.value
                ? 'bg-sky-500 border border-sky-500 text-white hover:bg-sky-400'
                : 'border border-slate-700 text-slate-400 hover:border-slate-500',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
    <button
      type="button"
      aria-label="Toggle sort direction"
      onClick={() => setSortAsc((a) => !a)}
      className="shrink-0 text-xs text-slate-400 bg-slate-900 border border-slate-700 rounded-md px-2 py-1 flex items-center gap-1 hover:border-slate-500 transition-colors"
    >
      {sortAsc
        ? <ArrowUp className="h-3.5 w-3.5" />
        : <ArrowDown className="h-3.5 w-3.5" />
      }
      {DIRECTION_LABELS[sortBy][sortAsc ? 0 : 1]}
    </button>
  </div>
  ```

  Key changes:
  - Outer row: `flex items-center gap-0.5` (2px gap, no `flex-wrap`)
  - Scroll wrapper div: `relative flex-1 overflow-hidden min-w-0` + Tailwind arbitrary `after:*` classes for the 16px fade (`after:w-4`) fading to `slate-800`
  - Scroll track div: `flex items-center gap-1.5 overflow-x-auto` with hidden scrollbar utilities
  - "Sort" label and all sort buttons are inside the scroll track
  - Added `shrink-0` to each sort button so they don't compress while scrolling
  - Direction button moved outside the scroll wrapper, `ml-auto` removed (no longer needed)

- [ ] **Step 3: Verify the dev server runs without errors**

  ```bash
  npm run dev
  ```

  Expected: server starts cleanly with no TypeScript or build errors.

- [ ] **Step 4: Verify visually in the browser**

  Open the players tab at a narrow viewport (≤ 375px wide, e.g. Chrome DevTools iPhone SE preset).

  Check:
  - Sort buttons ("Sort", "Name", "Games Played", "Won", "Win Rate", "Recent Form") appear on a single line and scroll horizontally
  - The A-Z / direction button stays pinned at the right and does not scroll
  - A subtle fade is visible at the right edge of the scroll area
  - Clicking sort buttons and the direction toggle still works correctly
  - At wider viewports (desktop) the row looks the same as before — all buttons visible, no layout change

- [ ] **Step 5: Commit**

  ```bash
  git add components/PublicPlayerList.tsx
  git commit -m "fix: horizontal scroll for sort buttons on mobile"
  ```
