# iOS Safari Drawer Bleed + Scroll Clipping Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `bg-slate-800` bleed into the iOS Safari URL bar after the stats drawer closes, and fix the drawer's scroll region so content scrolls naturally within it.

**Architecture:** Add a `mounted` state to `MobileStatsFAB` that trails `open` by 300ms on close; wrap the backdrop and sheet in `{mounted && (...)}` so they are removed from the DOM when fully closed. Add `flex-1 min-h-0` to the scrollable content div so `overflow-y-auto` creates a properly bounded scroll region inside the flex column.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS v3, TypeScript

---

### Context: no component test infrastructure

The existing Jest suite (`__tests__/`, `lib/__tests__/`) targets utility functions with `testEnvironment: 'node'`. There is no jsdom / React Testing Library setup. The two changes in this plan are visual/behavioural and must be verified manually on iOS Safari (or Safari desktop DevTools with a responsive viewport).

---

### Task 1: Add `mounted` state and conditional rendering

**Files:**
- Modify: `components/MobileStatsFAB.tsx`

This task adds a `mounted` boolean that lags behind `open` by the CSS transition duration (300ms). The backdrop and bottom sheet are only rendered while `mounted` is true, ensuring neither element exists in the DOM — and therefore cannot paint `bg-slate-800` into the iOS Safari URL bar area — after the drawer is fully closed.

- [ ] **Step 1: Read the current file**

Open `components/MobileStatsFAB.tsx` and confirm it looks like this:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { Activity, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MobileStatsFABProps {
  children: React.ReactNode
}

export function MobileStatsFAB({ children }: MobileStatsFABProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return

    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'

    return () => {
      const top = document.body.style.top
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      if (top && !isNaN(-parseInt(top, 10))) {
        window.scrollTo(0, -parseInt(top, 10))
      }
    }
  }, [open])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <>
      {/* Pill FAB */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-4 lg:hidden z-30 flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white rounded-full px-4 py-2.5 shadow-lg shadow-sky-500/30 text-sm font-semibold"
        aria-label="View live stats"
      >
        <Activity size={16} />
        Stats
      </button>

      {/* z-[60] intentionally higher than FAB z-30 and navbar z-50 — backdrop covers everything while sheet is open */}
      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={cn(
          'fixed inset-0 bg-slate-900/80 z-[60] lg:hidden transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      />

      {/* Bottom sheet */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-[70] lg:hidden bg-slate-800 border-t border-slate-700 rounded-t-2xl max-h-[85vh] flex flex-col transition-transform duration-300 ease-in-out',
          open ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-slate-600 rounded-full" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between pl-5 pr-4 py-3 flex-shrink-0">
          <span className="text-lg font-bold text-slate-100 tracking-tight">League Stats</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-slate-200 bg-slate-700/50 hover:bg-slate-700 rounded-lg p-1.5"
            aria-label="Close stats"
          >
            <X size={18} />
          </button>
        </div>
        {/* Scrollable content */}
        <div className="overflow-y-auto px-4 pb-6 pt-2">
          {children}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Replace the full file with the fixed version**

Replace the entire file contents with:

```tsx
// components/MobileStatsFAB.tsx
'use client'

import { useState, useEffect } from 'react'
import { Activity, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MobileStatsFABProps {
  children: React.ReactNode
}

export function MobileStatsFAB({ children }: MobileStatsFABProps) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Mount immediately on open; unmount after the close animation finishes (300ms matches CSS duration)
  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    const timer = setTimeout(() => setMounted(false), 300)
    return () => clearTimeout(timer)
  }, [open])

  // iOS-safe scroll lock: position:fixed preserves visual viewport dimensions on iOS Safari
  useEffect(() => {
    if (!open) return

    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'

    return () => {
      const top = document.body.style.top
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      if (top && !isNaN(-parseInt(top, 10))) {
        window.scrollTo(0, -parseInt(top, 10))
      }
    }
  }, [open])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <>
      {/* Pill FAB */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-4 lg:hidden z-30 flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white rounded-full px-4 py-2.5 shadow-lg shadow-sky-500/30 text-sm font-semibold"
        aria-label="View live stats"
      >
        <Activity size={16} />
        Stats
      </button>

      {/* Only render backdrop + sheet while mounted (open or animating closed).
          This ensures no bg-slate-800 element sits at fixed bottom-0 when the drawer is fully dismissed,
          which would bleed into the iOS Safari URL bar area. */}
      {mounted && (
        <>
          {/* z-[60] intentionally higher than FAB z-30 and navbar z-50 — backdrop covers everything while sheet is open */}
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            className={cn(
              'fixed inset-0 bg-slate-900/80 z-[60] lg:hidden transition-opacity duration-300',
              open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            )}
          />

          {/* Bottom sheet */}
          <div
            className={cn(
              'fixed inset-x-0 bottom-0 z-[70] lg:hidden bg-slate-800 border-t border-slate-700 rounded-t-2xl max-h-[85vh] flex flex-col transition-transform duration-300 ease-in-out',
              open ? 'translate-y-0' : 'translate-y-full'
            )}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-slate-600 rounded-full" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between pl-5 pr-4 py-3 flex-shrink-0">
              <span className="text-lg font-bold text-slate-100 tracking-tight">League Stats</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-200 bg-slate-700/50 hover:bg-slate-700 rounded-lg p-1.5"
                aria-label="Close stats"
              >
                <X size={18} />
              </button>
            </div>
            {/* Scrollable content — flex-1 fills remaining height; min-h-0 allows shrinking so overflow-y-auto creates a true scroll region */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 pt-2">
              {children}
            </div>
          </div>
        </>
      )}
    </>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run the existing test suite to confirm no regressions**

```bash
npm test
```

Expected: all tests pass (the suite tests utility functions; this change is UI-only).

- [ ] **Step 5: Commit**

```bash
git add components/MobileStatsFAB.tsx
git commit -m "fix: conditionally render drawer to remove iOS Safari URL bar bleed

Mount backdrop and sheet only while open or animating closed.
After the 300ms close transition, both elements are removed from the DOM,
so no bg-slate-800 div sits at fixed bottom-0 to bleed into the iOS Safari URL bar.

Also add flex-1 min-h-0 to scrollable content so overflow-y-auto
creates a bounded scroll region within the flex column."
```

---

### Manual verification checklist

Test on an iOS device or Safari DevTools with a responsive iPhone viewport:

- [ ] Open the stats drawer → close it → confirm no `bg-slate-800` box is visible around the iOS Safari URL bar at the bottom.
- [ ] Load the page without opening the drawer → confirm the URL bar area is clean (no fill, content visible through it as before).
- [ ] Open the drawer with enough stat content to exceed the drawer height → confirm content scrolls within the sheet and items exit smoothly off the bottom edge.
- [ ] Scroll down the match list, open the drawer, close it → confirm scroll position is restored to where it was.
- [ ] Open the drawer, press Escape → confirm drawer closes and URL bar area is clean.
- [ ] Verify no regression on desktop (FAB and sheet are `lg:hidden`; body styles are cleaned up).
