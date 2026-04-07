# Icon Updates — Settings & Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Share2 icon with a chain-link icon and the Settings icon with a sliders icon in `LeagueJoinArea`, and fix the invisible settings icon caused by missing `size="icon"` on the Button.

**Architecture:** Single-file change in `components/LeagueJoinArea.tsx`. Update the lucide-react import, replace icon components in JSX, and add the missing `size="icon"` prop to the admin settings Button.

**Tech Stack:** lucide-react, Next.js 14, Tailwind CSS, Radix UI Slot (via shadcn Button)

---

### Task 1: Update icons in LeagueJoinArea

**Files:**
- Modify: `components/LeagueJoinArea.tsx`

- [ ] **Step 1: Update the lucide-react import**

Replace line 5 in `components/LeagueJoinArea.tsx`:

```tsx
// Before
import { Settings, Share2 } from 'lucide-react'

// After
import { SlidersHorizontal, Link as LinkIcon } from 'lucide-react'
```

`Link` is aliased as `LinkIcon` because `Link` from `next/link` is already imported on line 4.

- [ ] **Step 2: Replace the Share icon in JSX**

Find this in the `{showShare && ...}` block (around line 83):

```tsx
<Share2 className="mr-1.5 size-3.5" />
```

Replace with:

```tsx
<LinkIcon className="mr-1.5 size-3.5" />
```

- [ ] **Step 3: Fix the settings Button and replace its icon**

Find the admin settings Button (around line 89–97):

```tsx
<Button
  asChild
  variant="ghost"
  className="h-7 w-7 border border-slate-700 text-slate-500 hover:bg-slate-800 hover:text-slate-400"
>
  <Link href={`/${leagueId}/settings`} aria-label="League settings">
    <Settings className="size-4" />
  </Link>
</Button>
```

Replace with:

```tsx
<Button
  asChild
  size="icon"
  variant="ghost"
  className="h-7 w-7 border border-slate-700 text-slate-500 hover:bg-slate-800 hover:text-slate-400"
>
  <Link href={`/${leagueId}/settings`} aria-label="League settings">
    <SlidersHorizontal className="size-4" />
  </Link>
</Button>
```

**Why `size="icon"`:** The default `size="default"` adds `px-4 py-2` padding. On a 28px-wide button, 16px of left padding + 16px of right padding leaves no room for the icon — it gets clipped to zero visible width. `size="icon"` removes horizontal padding entirely.

- [ ] **Step 4: Verify visually**

Run the dev server:
```bash
npm run dev
```

Navigate to a league page as an admin. Confirm:
- The settings button (top-right of league header) now shows a sliders icon
- The share button (for members) now shows a chain-link icon
- Neither icon is invisible or clipped

- [ ] **Step 5: Commit**

```bash
git add components/LeagueJoinArea.tsx
git commit -m "fix: replace share/settings icons and fix invisible settings icon"
```
