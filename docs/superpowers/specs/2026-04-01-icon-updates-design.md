# Icon Updates — Settings & Share

**Date:** 2026-04-01
**File affected:** `components/LeagueJoinArea.tsx`

## Changes

### 1. Settings icon — SlidersHorizontal + visibility fix

**Current:** `Settings` icon (gear), invisible due to a layout bug.
**Bug:** `Button` defaults to `size="default"` which applies `px-4 py-2`. Combined with `w-7` (28px), the padding consumes all available width, hiding the icon. Fix: add `size="icon"` to remove that padding.
**New icon:** `SlidersHorizontal` from lucide-react.

### 2. Share icon — Link (chain link)

**Current:** `Share2` (branching node icon).
**New icon:** `Link` from lucide-react, aliased as `LinkIcon` to avoid collision with the `Link` default import from `next/link`.

## Implementation

Single file: `components/LeagueJoinArea.tsx`

1. Update import: `import { Settings, Share2 } from 'lucide-react'` → `import { SlidersHorizontal, Link as LinkIcon } from 'lucide-react'`
2. Share button: replace `<Share2 className="mr-1.5 size-3.5" />` with `<LinkIcon className="mr-1.5 size-3.5" />`
3. Settings button: add `size="icon"` prop to `Button`, replace `<Settings className="size-4" />` with `<SlidersHorizontal className="size-4" />`
