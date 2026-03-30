# iOS Safari Drawer Bleed + Scroll Clipping Fix — Design

**Date:** 2026-03-30
**Status:** Approved

---

## Problem

### 1. bg-slate-800 bleed into iOS Safari URL bar

After the stats bottom sheet is dismissed, a `bg-slate-800` rectangle appears around the iOS Safari URL bar at the bottom of the screen. Before opening the drawer nothing is visible there — content scrolls naturally through and around the URL bar area.

**Root cause:** The backdrop and bottom sheet are always present in the DOM. The sheet uses `translate-y-full` to slide off-screen on close, but `fixed inset-x-0 bottom-0 bg-slate-800` remains. Its top edge sits at exactly the visual viewport bottom — the same area iOS Safari uses for its URL bar. The `bg-slate-800` background paints into that region even when the drawer is "hidden".

### 2. Scroll clipping in the drawer

Content in the drawer is clipped at the bottom rather than scrolling smoothly within the sheet. The user cannot see items scroll off the bottom edge naturally.

**Root cause:** The scrollable content div (`overflow-y-auto`) is a flex child inside a `flex flex-col max-h-[85vh]` container but has no `flex-1` or `min-h-0`. Without `flex-1`, it doesn't fill remaining space. Without `min-h-0`, a flex item cannot shrink below its natural content height (browser default `min-height: auto`). So `overflow-y-auto` never creates a bounded scroll region — content overflows the container instead of scrolling within it.

---

## Previous fixes (remain in place)

- **PR #45** — `position: fixed` body lock on open: still needed to prevent background scroll while the drawer is open.
- **PR #47** — `themeColor: '#0f172a'` + `html bg-slate-900`: still needed to prevent the sky-500 FAB from bleeding into iOS Safari browser chrome and to guard the overscroll rubber-band background.

These address different issues and are not affected by this fix.

---

## Solution

### Fix 1 — Conditional rendering

Add a `mounted` boolean state. Wrap the backdrop and bottom sheet in `{mounted && (...)}`.

- When `open` becomes `true`: set `mounted = true` immediately (drawer appears, animation plays in).
- When `open` becomes `false`: wait 300ms (the CSS transition duration), then set `mounted = false`.

After close, both DOM elements are fully removed. Nothing is left at `fixed bottom-0 bg-slate-800` to bleed into the URL bar.

### Fix 2 — Scrollable flex child

Add `flex-1 min-h-0` to the scrollable content div:

```
// before
overflow-y-auto px-4 pb-6 pt-2

// after
flex-1 min-h-0 overflow-y-auto px-4 pb-6 pt-2
```

`flex-1` fills remaining height after the fixed-size header/drag-handle. `min-h-0` allows the element to shrink, enabling `overflow-y-auto` to create a true scroll region bounded by the drawer's `max-h-[85vh]`.

---

## Scope

**One file:** `components/MobileStatsFAB.tsx`

- Add `mounted` state and `useEffect` to manage it
- Wrap backdrop + bottom sheet JSX in `{mounted && (...)}`
- Add `flex-1 min-h-0` to scrollable content div

No new dependencies. No other files touched.

---

## Testing

- Open drawer → close → confirm no `bg-slate-800` box visible around iOS Safari URL bar.
- Before opening → confirm URL bar area is clean (no regression).
- Open drawer with tall content → confirm content scrolls within the sheet, items exit smoothly off the bottom edge.
- Open drawer → navigate away mid-open → confirm body styles are cleaned up.
- Verify no regression on desktop (FAB and sheet are `lg:hidden`).
