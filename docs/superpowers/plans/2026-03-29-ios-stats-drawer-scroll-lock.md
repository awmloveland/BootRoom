# iOS Stats Drawer Scroll Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `overflow: hidden` body scroll lock in `MobileStatsFAB` with a `position: fixed` lock that doesn't trigger iOS Safari's visual viewport recalculation, eliminating the dark fill artifact that appears at the bottom of the screen after closing the stats drawer.

**Architecture:** A single `useEffect` in `MobileStatsFAB.tsx` is swapped out. On open, `window.scrollY` is saved by writing it into `document.body.style.top` as a negative pixel value alongside `position: fixed` and `width: 100%`. On close (and in the cleanup function), those styles are cleared and `window.scrollTo` restores the saved position. No new state, refs, or dependencies are introduced.

**Tech Stack:** Next.js 14, TypeScript, React `useEffect`

---

### Task 1: Replace the body overflow lock with a position-fixed lock

**Files:**
- Modify: `components/MobileStatsFAB.tsx:15-20`

- [ ] **Step 1: Open the file and locate the scroll lock effect**

Read `components/MobileStatsFAB.tsx`. The target is lines 15–20:

```ts
useEffect(() => {
  document.body.style.overflow = open ? 'hidden' : ''
  return () => {
    document.body.style.overflow = ''
  }
}, [open])
```

- [ ] **Step 2: Replace the effect with the position-fixed lock**

Replace those lines with:

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

- [ ] **Step 3: Verify the build compiles cleanly**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/ottawa
npm run build
```

Expected: build completes with no TypeScript errors. There should be no errors related to `MobileStatsFAB.tsx`.

- [ ] **Step 4: Commit**

```bash
git add components/MobileStatsFAB.tsx
git commit -m "fix: use position-fixed body lock to prevent iOS Safari viewport glitch on stats drawer close"
```

---

### Task 2: Manual verification on iOS Safari

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open the league results page on an iOS Safari device or simulator**

Navigate to a public league results page (e.g. `/results/<leagueId>`). Scroll down so the Stats FAB is visible and the URL bar is in its retracted state.

- [ ] **Step 3: Verify the normal state**

Content should be visible all the way to the bottom of the screen, with no dark fill around the URL bar area. This matches Image (2) from the bug report.

- [ ] **Step 4: Open the stats drawer**

Tap the **Stats** FAB. The bottom sheet should slide up. Content inside the sheet should be scrollable. Background content should not scroll (body is locked).

- [ ] **Step 5: Close the stats drawer and check for the bug**

Tap the **×** button or the backdrop. The sheet should slide down.

**Expected (fixed):** page content fills the screen as before, no dark fill at the bottom, URL bar state is unchanged from before opening.

**Previously broken:** a `bg-slate-900` strip appeared at the bottom, cropping match cards.

- [ ] **Step 6: Verify scroll position is restored**

Scroll to Week 5 in the match list, open the drawer, close it. Confirm the page returns to Week 5 — not the top.

- [ ] **Step 7: Verify Escape key still closes the drawer**

Open the drawer (desktop or physical keyboard), press Escape. Sheet should close and scroll position should be restored.
