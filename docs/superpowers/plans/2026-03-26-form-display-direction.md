# Form Display Direction Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reverse the form string in the two display components so the most recent result appears on the right.

**Architecture:** The `recentForm` data string is built by SQL with `ORDER BY week DESC`, making index 0 the most recent result. Both display components (`RecentForm`, `FormDots`) currently render it left-to-right, which shows the newest result on the left. We reverse the string at render time only — `[...form].reverse()` — so no data, scoring, or sorting logic changes.

**Tech Stack:** TypeScript, React, Jest (existing test runner — `npm test`)

---

## Files

| Action | File | What changes |
|---|---|---|
| Modify | `components/RecentForm.tsx` | Reverse `form` before mapping |
| Modify | `components/FormDots.tsx` | Reverse `form` before mapping |
| Create | `__tests__/form-display.test.ts` | Verify display order of form chars |

---

### Task 1: Write a failing test for form display order

The test captures the contract: given a form string `'WWDLL'` (newest-first in data), the characters rendered should be in reversed order `['L','L','D','W','W']` (oldest-first for display). We test the reversal logic directly since there is no React Testing Library in this project.

**Files:**
- Create: `__tests__/form-display.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
// __tests__/form-display.test.ts

/**
 * The recentForm data string is stored newest-first (index 0 = most recent).
 * Display components must reverse it so the oldest result is on the left
 * and the most recent result is on the right — matching the football stats convention.
 */
function displayOrder(form: string): string[] {
  return [...form].reverse()
}

describe('form display order', () => {
  it('reverses a full 5-char form string so newest is last', () => {
    // data string: W=most recent, L=oldest
    expect(displayOrder('WWDLL')).toEqual(['L', 'L', 'D', 'W', 'W'])
  })

  it('handles a form string with placeholder dashes', () => {
    // '--WLW': most recent is W (index 0), two unplayed slots at end
    expect(displayOrder('--WLW')).toEqual(['W', 'L', 'W', '-', '-'])
  })

  it('handles a single-char form string', () => {
    expect(displayOrder('W')).toEqual(['W'])
  })

  it('handles an empty form string', () => {
    expect(displayOrder('')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it passes (pure logic — no implementation needed)**

```bash
npm test -- --testPathPattern="form-display" --no-coverage
```

Expected output:
```
PASS __tests__/form-display.test.ts
  form display order
    ✓ reverses a full 5-char form string so newest is last
    ✓ handles a form string with placeholder dashes
    ✓ handles a single-char form string
    ✓ handles an empty form string
```

- [ ] **Step 3: Commit**

```bash
git add __tests__/form-display.test.ts
git commit -m "test: add form display order tests"
```

---

### Task 2: Fix `RecentForm` component

**Files:**
- Modify: `components/RecentForm.tsx`

Current content of `components/RecentForm.tsx`:
```tsx
interface RecentFormProps {
  form: string // 5-char string e.g. 'WWDLW' or '--WLW'
}

const CHAR_CLASS: Record<string, string> = {
  W: 'text-green-400',
  D: 'text-slate-400',
  L: 'text-red-400',
  '-': 'text-slate-600',
}

export function RecentForm({ form }: RecentFormProps) {
  return (
    <span className="flex gap-1.5">
      {form.split('').map((char, i) => (
        <span
          key={i}
          className={`font-mono text-sm font-bold tracking-wide ${CHAR_CLASS[char] ?? 'text-slate-500'}`}
        >
          {char}
        </span>
      ))}
    </span>
  )
}
```

- [ ] **Step 1: Replace `form.split('')` with `[...form].reverse()` in the map**

Replace the entire file with:

```tsx
interface RecentFormProps {
  form: string // 5-char string e.g. 'WWDLW' or '--WLW'
}

const CHAR_CLASS: Record<string, string> = {
  W: 'text-green-400',
  D: 'text-slate-400',
  L: 'text-red-400',
  '-': 'text-slate-600',
}

export function RecentForm({ form }: RecentFormProps) {
  return (
    <span className="flex gap-1.5">
      {[...form].reverse().map((char, i) => (
        <span
          key={i}
          className={`font-mono text-sm font-bold tracking-wide ${CHAR_CLASS[char] ?? 'text-slate-500'}`}
        >
          {char}
        </span>
      ))}
    </span>
  )
}
```

- [ ] **Step 2: Run the full test suite to confirm nothing is broken**

```bash
npm test -- --no-coverage
```

Expected: all tests pass. There are no existing tests that assert on `RecentForm` rendered output.

- [ ] **Step 3: Commit**

```bash
git add components/RecentForm.tsx
git commit -m "fix: reverse form string in RecentForm so newest result is on the right"
```

---

### Task 3: Fix `FormDots` component

**Files:**
- Modify: `components/FormDots.tsx`

Current content of `components/FormDots.tsx`:
```tsx
import { cn } from '@/lib/utils'

export const FORM_COLOR: Record<string, string> = {
  W: 'text-sky-400',
  D: 'text-slate-400',
  L: 'text-red-400',
  '-': 'text-slate-700',
}

export function FormDots({ form }: { form: string }) {
  return (
    <span className="flex gap-1">
      {form.split('').map((char, i) => (
        <span key={i} className={cn('font-mono text-xs font-bold', FORM_COLOR[char] ?? 'text-slate-600')}>
          {char}
        </span>
      ))}
    </span>
  )
}
```

- [ ] **Step 1: Replace `form.split('')` with `[...form].reverse()` in the map**

Replace the entire file with:

```tsx
import { cn } from '@/lib/utils'

export const FORM_COLOR: Record<string, string> = {
  W: 'text-sky-400',
  D: 'text-slate-400',
  L: 'text-red-400',
  '-': 'text-slate-700',
}

export function FormDots({ form }: { form: string }) {
  return (
    <span className="flex gap-1">
      {[...form].reverse().map((char, i) => (
        <span key={i} className={cn('font-mono text-xs font-bold', FORM_COLOR[char] ?? 'text-slate-600')}>
          {char}
        </span>
      ))}
    </span>
  )
}
```

- [ ] **Step 2: Run the full test suite to confirm nothing is broken**

```bash
npm test -- --no-coverage
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add components/FormDots.tsx
git commit -m "fix: reverse form string in FormDots so newest result is on the right"
```
