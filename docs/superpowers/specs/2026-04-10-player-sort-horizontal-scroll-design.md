# Player Sort Bar — Horizontal Scroll on Mobile

**Date:** 2026-04-10
**File:** `components/PublicPlayerList.tsx`

## Problem

On mobile, the sort buttons (Name, Games Played, Won, Win Rate, Recent Form) wrap onto two lines because the sort row uses `flex-wrap`. This wastes vertical space and looks untidy.

## Design

Replace `flex-wrap` on the sort row with a horizontally scrollable track. The A-Z direction toggle button stays pinned at the right.

### Layout structure

```
[ scroll-wrapper (flex: 1, overflow hidden)          ] [ A-Z btn (fixed) ]
  [ scroll-track (overflow-x: auto, no scrollbar)  ]
    Sort  Name  Games Played  Won  Win Rate  Recent Form →
```

- **Scroll wrapper** — `flex: 1`, `overflow: hidden`, `min-width: 0`. Hosts the fade overlay.
- **Scroll track** — `overflow-x: auto`, `display: flex`, `gap: 6px`, hidden scrollbar. Contains the "Sort" label and all sort buttons. Everything in here scrolls together.
- **Fade overlay** — `::after` pseudo-element on the scroll wrapper, positioned absolute on the right edge. `width: 16px`, gradient from transparent → `bg-slate-800` (`#1e293b`). Hints that more buttons are off-screen.
- **Gap between scroll wrapper and A-Z button** — `2px` (set on the outer flex row).
- **A-Z direction button** — `shrink-0`, sits outside the scroll wrapper, always visible.

### Changes to `PublicPlayerList.tsx`

The sort row `<div>` at line 93 currently:
```tsx
<div role="group" aria-label="Sort by" className="flex items-center gap-2 flex-wrap">
  <span>Sort</span>
  {SORT_OPTIONS.map(...)}   {/* sort buttons */}
  <button>↑ A–Z</button>   {/* ml-auto, direction toggle */}
</div>
```

Becomes:
```tsx
<div role="group" aria-label="Sort by" className="flex items-center gap-0.5">
  <div className="relative flex-1 overflow-hidden min-w-0
                  after:absolute after:right-0 after:top-0 after:bottom-0
                  after:w-4 after:bg-gradient-to-r after:from-transparent after:to-slate-800
                  after:pointer-events-none">
    <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <span>Sort</span>
      {SORT_OPTIONS.map(...)}
    </div>
  </div>
  <button>↑ A–Z</button>
</div>
```

Key class changes:
- Outer row: `flex items-center gap-0.5` (gap-0.5 = 2px)
- Scroll wrapper: `relative flex-1 overflow-hidden min-w-0` + Tailwind arbitrary `after:*` classes for the fade
- Scroll track: `flex items-center gap-1.5 overflow-x-auto` + hidden scrollbar utilities
- "Sort" label and all sort buttons move inside the scroll track
- Direction button stays outside, `shrink-0` already present

### No behaviour changes

Sort state, direction toggle, and all button interactions are unchanged. This is a pure layout fix.

## Out of scope

- Desktop layout is unaffected (buttons have room to fit on one line at wider viewports)
- No changes to sort logic, PlayerCard, or any other component
