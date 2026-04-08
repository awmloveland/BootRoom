# Avatar Account Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `User` icon button in the navbar with a circular avatar button showing name-derived double initials and a deterministic colour.

**Architecture:** Two pure utility functions (`getInitials`, `getAvatarColor`) are added to `lib/utils.ts` and unit-tested. A presentational `AvatarButton` component in `components/ui/AvatarButton.tsx` consumes them and renders the circle. The existing `Navbar` swaps the old `Button + User icon` for `AvatarButton` in both the desktop dropdown trigger and the mobile sheet trigger — no other logic changes.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Tailwind CSS v3, Jest + ts-jest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `lib/utils.ts` | Add `getInitials` and `getAvatarColor` |
| Create | `lib/__tests__/utils.avatar.test.ts` | Unit tests for both utilities |
| Create | `components/ui/AvatarButton.tsx` | Circular initials button component |
| Modify | `components/ui/navbar.tsx` | Swap icon buttons for `AvatarButton` |

---

## Task 1: Utility functions — `getInitials` and `getAvatarColor`

**Files:**
- Modify: `lib/utils.ts`
- Create: `lib/__tests__/utils.avatar.test.ts`

### Background

`getInitials` extracts up to two uppercase initials from a display name string.
`getAvatarColor` hashes the name to one of six curated dark-theme colour sets — same name always maps to the same colour.

The six colours (index 0–5):

| Index | bg        | border    | text      |
|-------|-----------|-----------|-----------|
| 0     | `#1e1b4b` | `#4f46e5` | `#a5b4fc` |
| 1     | `#1e3a5f` | `#2563eb` | `#93c5fd` |
| 2     | `#2e1065` | `#7c3aed` | `#c4b5fd` |
| 3     | `#0d2b2b` | `#0d9488` | `#5eead4` |
| 4     | `#2d0a16` | `#e11d48` | `#fda4af` |
| 5     | `#0c2233` | `#0284c7` | `#7dd3fc` |

Hash algorithm: sum all char codes of `name`, take `% 6`.

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/utils.avatar.test.ts`:

```ts
import { getInitials, getAvatarColor } from '../utils'

describe('getInitials', () => {
  it('returns double initials for a two-word name', () => {
    expect(getInitials('Will Loveland')).toBe('WL')
  })

  it('returns double initials for a three-word name (uses first two words)', () => {
    expect(getInitials('Mary Jo Smith')).toBe('MJ')
  })

  it('returns single initial for a one-word name', () => {
    expect(getInitials('Madonna')).toBe('M')
  })

  it('returns empty string for an empty string', () => {
    expect(getInitials('')).toBe('')
  })

  it('uppercases initials regardless of input case', () => {
    expect(getInitials('will loveland')).toBe('WL')
  })

  it('trims leading/trailing whitespace', () => {
    expect(getInitials('  Will Loveland  ')).toBe('WL')
  })
})

describe('getAvatarColor', () => {
  it('returns an object with bg, border, and text string properties', () => {
    const color = getAvatarColor('Will Loveland')
    expect(typeof color.bg).toBe('string')
    expect(typeof color.border).toBe('string')
    expect(typeof color.text).toBe('string')
  })

  it('returns the same colour for the same name', () => {
    expect(getAvatarColor('Will Loveland')).toEqual(getAvatarColor('Will Loveland'))
  })

  it('returns a valid palette entry (bg starts with #)', () => {
    const color = getAvatarColor('Alice')
    expect(color.bg).toMatch(/^#[0-9a-f]{6}$/i)
    expect(color.border).toMatch(/^#[0-9a-f]{6}$/i)
    expect(color.text).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('returns a colour for an empty string without throwing', () => {
    expect(() => getAvatarColor('')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- lib/__tests__/utils.avatar.test.ts
```

Expected: FAIL — `getInitials` and `getAvatarColor` not found.

- [ ] **Step 3: Add the utilities to `lib/utils.ts`**

Append to the bottom of `lib/utils.ts` (after the existing `parseGoogleName` function):

```ts
const AVATAR_PALETTE: { bg: string; border: string; text: string }[] = [
  { bg: '#1e1b4b', border: '#4f46e5', text: '#a5b4fc' }, // indigo
  { bg: '#1e3a5f', border: '#2563eb', text: '#93c5fd' }, // blue
  { bg: '#2e1065', border: '#7c3aed', text: '#c4b5fd' }, // violet
  { bg: '#0d2b2b', border: '#0d9488', text: '#5eead4' }, // teal
  { bg: '#2d0a16', border: '#e11d48', text: '#fda4af' }, // rose
  { bg: '#0c2233', border: '#0284c7', text: '#7dd3fc' }, // sky
]

/**
 * Returns up to two uppercase initials from a display name.
 * "Will Loveland" → "WL", "Madonna" → "M", "" → ""
 */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  if (words.length === 1) return words[0][0].toUpperCase()
  return words[0][0].toUpperCase() + words[1][0].toUpperCase()
}

/**
 * Deterministically maps a display name to one of six dark-theme colour sets.
 * Same name always returns the same colour.
 */
export function getAvatarColor(name: string): { bg: string; border: string; text: string } {
  const index = name.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_PALETTE.length
  return AVATAR_PALETTE[index]
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- lib/__tests__/utils.avatar.test.ts
```

Expected: all 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.avatar.test.ts
git commit -m "feat: add getInitials and getAvatarColor utilities"
```

---

## Task 2: `AvatarButton` component

**Files:**
- Create: `components/ui/AvatarButton.tsx`

### Background

A purely presentational `<button>` that renders a 36×36px circle with initials and name-derived colour. It accepts `name` and an optional `onClick` + `className`. It has no dropdown or sheet logic — it is only a trigger.

- [ ] **Step 1: Create `components/ui/AvatarButton.tsx`**

```tsx
'use client'

import { getInitials, getAvatarColor } from '@/lib/utils'

interface AvatarButtonProps {
  name: string
  onClick?: () => void
  className?: string
}

export function AvatarButton({ name, onClick, className }: AvatarButtonProps) {
  const initials = getInitials(name)
  const color = getAvatarColor(name)

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold tracking-wide transition-shadow hover:ring-2 hover:ring-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${className ?? ''}`}
      style={{
        background: color.bg,
        border: `1px solid ${color.border}`,
        color: color.text,
      }}
    >
      {initials}
    </button>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ui/AvatarButton.tsx
git commit -m "feat: add AvatarButton component"
```

---

## Task 3: Wire `AvatarButton` into the Navbar

**Files:**
- Modify: `components/ui/navbar.tsx`

### Background

There are two places to update in `navbar.tsx`:

1. **Desktop** (around line 268): `DropdownMenuTrigger` wrapping a `Button variant="outline" size="sm"` with `<User className="size-4" />` — replace the `Button` with `AvatarButton`.
2. **Mobile** (around line 313): `SheetTrigger` wrapping a `Button variant="outline" size="icon"` with `<User className="size-4" />` — replace with `AvatarButton`.

The `DropdownMenuTrigger` and `SheetTrigger` both accept `asChild`, which forwards their open/close logic to the child element. `AvatarButton` renders a plain `<button>`, so `asChild` works correctly.

- [ ] **Step 1: Add the import**

In `components/ui/navbar.tsx`, find the existing imports block. Add:

```ts
import { AvatarButton } from '@/components/ui/AvatarButton'
```

Also remove `User` from the lucide-react import line if it is no longer used elsewhere in the file. The current import is:

```ts
import { Settings, User, LogOut, FlaskConical } from 'lucide-react'
```

Change to:

```ts
import { Settings, LogOut, FlaskConical } from 'lucide-react'
```

- [ ] **Step 2: Replace the desktop trigger**

Find this block (around line 268):

```tsx
<DropdownMenuTrigger asChild>
  <Button variant="outline" size="sm">
    <User className="size-4" />
  </Button>
</DropdownMenuTrigger>
```

Replace with:

```tsx
<DropdownMenuTrigger asChild>
  <AvatarButton name={displayName ?? ''} />
</DropdownMenuTrigger>
```

- [ ] **Step 3: Replace the mobile trigger**

Find this block (around line 313):

```tsx
<SheetTrigger asChild>
  <Button variant="outline" size="icon" className="shrink-0">
    <User className="size-4" />
  </Button>
</SheetTrigger>
```

Replace with:

```tsx
<SheetTrigger asChild>
  <AvatarButton name={displayName ?? ''} />
</SheetTrigger>
```

- [ ] **Step 4: Remove unused `Button` import if no longer needed**

Check whether `Button` is still used elsewhere in `navbar.tsx` (it is used for the FlaskConical experiments link). Leave it if so. If it was only used for the account triggers, remove it.

Current usage to check — search for `<Button` in `navbar.tsx`. The experiments button at line 262 still uses it:

```tsx
<Button asChild variant="ghost" size="sm">
  <Link href="/experiments" title="Experiments">
    <FlaskConical className="size-4" />
  </Link>
</Button>
```

`Button` is still needed — leave the import.

- [ ] **Step 5: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```

Expected: all existing tests pass (no regressions).

- [ ] **Step 7: Commit**

```bash
git add components/ui/navbar.tsx
git commit -m "feat: replace User icon button with AvatarButton in navbar"
```

---

## Manual Verification Checklist

After all tasks are done, verify in the browser (`npm run dev`):

- [ ] Logged-in user on desktop shows a circular avatar button with correct initials and colour
- [ ] Clicking the avatar opens the existing account dropdown (name, Admin/Member label, Account Settings, Log out)
- [ ] Logged-in user on mobile (narrow viewport) shows the same circular avatar button
- [ ] Clicking the mobile avatar opens the existing slide-in sheet
- [ ] Hovering the avatar button shows the slate ring
- [ ] Keyboard tab to the button, press Enter — dropdown opens
- [ ] Two users with different display names get different colours
- [ ] A single-word display name shows one initial
