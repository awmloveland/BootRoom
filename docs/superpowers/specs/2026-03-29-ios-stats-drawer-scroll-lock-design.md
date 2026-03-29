# iOS Safari Stats Drawer Scroll Lock — Design

**Date:** 2026-03-29
**Status:** Approved

---

## Problem

On iOS Safari, opening the stats bottom sheet (via `MobileStatsFAB`) and then closing it leaves a dark fill at the bottom of the screen, cropping the match list content. The Safari URL bar becomes visible but the page background fills in beneath it rather than content.

**Root cause:** `MobileStatsFAB.tsx` locks background scroll by setting `document.body.style.overflow = 'hidden'`. On iOS Safari this triggers a visual viewport recalculation — the browser adjusts whether the URL bar is shown or hidden. When overflow is reset to `''` on close, Safari re-shows the URL bar and resizes the visual viewport, but the page does not repaint correctly, leaving a blank `bg-slate-900` strip at the bottom.

---

## Solution — Position-fixed body lock (Option A)

Replace the `overflow` approach with the canonical iOS-safe scroll lock:

**On open:**
1. Read `window.scrollY` at the moment the drawer opens.
2. Set on `document.body`:
   - `position: fixed`
   - `top: -${scrollY}px`
   - `width: 100%`

**On close (and cleanup):**
1. Parse the scroll position back from `document.body.style.top` (e.g. `"-342px"` → `342`).
2. Clear `position`, `top`, and `width` from `document.body`.
3. Call `window.scrollTo(0, parsedScrollY)` to restore exact position.

**Why this works:** `position: fixed` freezes the body in place without touching the visual viewport API. iOS Safari does not recalculate URL bar visibility, so the viewport dimensions stay consistent before and after the drawer.

---

## Scope

**One file changes:** `components/MobileStatsFAB.tsx`

**One `useEffect` changes:** lines 15–20 (the overflow lock effect). The keyboard handler effect and all JSX are untouched.

No new dependencies. No new files. No changes to any page, API route, or other component.

---

## Scroll position

Stored implicitly in `document.body.style.top` — no React ref or extra state needed. Retrieved by parsing the string value on close. The cleanup function mirrors the close path exactly, so navigating away mid-open also restores scroll correctly.

---

## Implementation

**File:** `components/MobileStatsFAB.tsx`
**Change:** Replace the `useEffect` at lines 15–20 with:

```ts
useEffect(() => {
  if (open) {
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'
  } else {
    const top = document.body.style.top
    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.width = ''
    if (top) {
      window.scrollTo(0, -parseInt(top, 10))
    }
  }
  return () => {
    const top = document.body.style.top
    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.width = ''
    if (top) {
      window.scrollTo(0, -parseInt(top, 10))
    }
  }
}, [open])
```

---

## Testing

- Open the stats drawer on iOS Safari → close it → confirm no dark fill at bottom.
- Scroll down the match list before opening → close drawer → confirm scroll position is restored.
- Navigate away while drawer is open → confirm body styles are cleaned up (check via DevTools).
- Verify no regression on desktop (the FAB and sheet are `lg:hidden`; body styles are cleaned up in all paths).
