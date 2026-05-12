# Guest Row Interactivity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin-only "name a guest" affordance read as interactive — guest rows get a dashed border, and the icon-only `UserPlus` button is replaced with an inline `Plus` icon + "Add Player" text in the team colour.

**Architecture:** A single-file change to `components/TeamList.tsx`. Two adjustments to existing markup: (1) toggle `border-solid` ↔ `border-dashed` based on the same `showNameGuest` flag that already gates the button, and (2) replace the icon-only button JSX with an inline icon + label button that uses team-coloured `text-sky-400` / `text-violet-400` classes. No new files, no API changes, no callback-contract changes.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, lucide-react, Jest + ts-jest (existing pure-logic test runner; no React Testing Library in this repo).

---

## File Structure

**Modify:**
- `components/TeamList.tsx` — swap `border` → `border border-dashed` on guest rows; replace the `UserPlus` icon-only button with a `Plus` + "Add Player" inline button, team-coloured, with hover/focus states.

**No other files change.** `MatchCard`, `WeekList`, `NameGuestModal`, and the `onNameGuest` callback contract are all untouched. Per the spec, the cancelled-match path goes through `CancelledCard` (a separate component in `MatchCard.tsx`) and never receives `onNameGuest`, so it inherits no changes.

---

## Task 1: Update `TeamList` with dashed guest rows and labelled "+ Add Player" button

**Files:**
- Modify: `components/TeamList.tsx`

- [ ] **Step 1: Replace `components/TeamList.tsx` with the updated file**

Full new contents of `components/TeamList.tsx`:

```tsx
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isGuestName } from '@/lib/guestName'

interface TeamListProps {
  label: string
  players: string[]
  team: 'A' | 'B'
  rating?: number | null
  goalkeepers?: string[]
  onNameGuest?: (guestName: string) => void
}

export function TeamList({ label, players, team, rating, goalkeepers, onNameGuest }: TeamListProps) {
  const isA = team === 'A'

  return (
    <div>
      {/* Team heading + score chip */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-100">{label}</p>
        {rating != null && (
          <span className={cn(
            'px-1.5 py-0.5 rounded text-xs font-semibold tabular-nums border',
            isA
              ? 'bg-sky-900/60 border-sky-700 text-sky-300'
              : 'bg-violet-900/60 border-violet-700 text-violet-300'
          )}>
            {rating.toFixed(3)}
          </span>
        )}
      </div>

      {/* Player rows */}
      <ul className="space-y-1">
        {players.map((player) => {
          const showNameGuest = !!onNameGuest && isGuestName(player)
          return (
            <li
              key={player}
              className={cn(
                'text-xs font-medium px-2.5 py-1.5 rounded border flex items-center justify-between gap-2',
                showNameGuest && 'border-dashed',
                isA
                  ? 'bg-sky-950/40 border-sky-900/60 text-sky-100'
                  : 'bg-violet-950/40 border-violet-900/60 text-violet-100'
              )}
            >
              <span>{player}{goalkeepers?.includes(player) ? ' 🧤' : ''}</span>
              {showNameGuest && (
                <button
                  type="button"
                  onClick={() => onNameGuest!(player)}
                  aria-label={`Name ${player}`}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1 whitespace-nowrap',
                    'text-[11px] font-semibold px-1 py-0.5 rounded',
                    'hover:underline focus-visible:outline-none focus-visible:ring-2',
                    isA
                      ? 'text-sky-400 hover:text-sky-300 focus-visible:ring-sky-400'
                      : 'text-violet-400 hover:text-violet-300 focus-visible:ring-violet-400'
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Player
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

Notes on what changed vs. the previous file:

1. `UserPlus` import → `Plus` import (lucide-react).
2. Added `showNameGuest && 'border-dashed'` to the `<li>` `className`. Tailwind's `border-dashed` only sets `border-style`; the `border` width and team-coloured border colour already on the row are preserved.
3. Replaced the icon-only button with an icon + text button. New classes: `inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold px-1 py-0.5 rounded`, plus team-coloured text/hover/focus-ring (`text-sky-400 hover:text-sky-300 focus-visible:ring-sky-400` for Team A, the violet equivalents for Team B). `hover:underline` is on the shared class string.
4. `aria-label={`Name ${player}`}` is kept (visible label is "Add Player"; aria-label still gives screen-reader users the guest name).
5. `type="button"` and the `onClick` handler are unchanged.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No type errors introduced.

- [ ] **Step 3: Run existing tests to confirm no regression**

Run: `npm run test`
Expected: All existing tests still pass. (No tests reference `TeamList` directly; this is a sanity check.)

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: No new lint errors in `components/TeamList.tsx`.

- [ ] **Step 5: Manual smoke test**

Start the dev server: `npm run dev`

In a browser, signed in as an admin of a league with at least one recorded match containing a guest entry (e.g. "Will +1"), open the league home and expand that match card. Verify:

- The guest row has a **dashed** border in the team colour (sky for Team A, violet for Team B). Non-guest rows remain solid.
- The right edge of the guest row shows **"+ Add Player"** in the team-coloured text (sky-400 / violet-400). No background, no border.
- Hovering the button **brightens** the text (sky-300 / violet-300) and **underlines** it. The row itself does not change.
- Tab-focusing the button shows a **team-coloured ring** (sky-400 / violet-400) with no outline.
- Clicking the button opens the existing `NameGuestModal`, pre-filled with the guest's name. (No regression in the existing flow.)

Then sign out (or use a member account) and revisit the same match card. Verify:

- The guest row has a **solid** border (no dashed treatment).
- No "+ Add Player" button is rendered.

Finally, find a cancelled match with a guest entry (or open one) and verify the cancelled card renders unchanged — no dashed border, no button (cancelled matches render through `CancelledCard`, which never passes `onNameGuest`).

- [ ] **Step 6: Commit**

```bash
git add components/TeamList.tsx
git commit -m "feat(team-list): dashed guest rows + labelled Add Player button"
```

---

## Self-Review

**Spec coverage:**
- Dashed border on guest rows, gated on `showNameGuest` → Step 1 line `showNameGuest && 'border-dashed'`. ✓
- Replace icon-only button with `Plus` + "Add Player" → Step 1 button JSX. ✓
- Team-coloured text (sky-400 / violet-400) and hover (sky-300 / violet-300 + underline) → Step 1 conditional classes. ✓
- Focus ring matching app convention (`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400` / `ring-violet-400`) → Step 1 conditional classes. ✓
- `aria-label={`Name ${player}`}` preserved → Step 1 button JSX. ✓
- `type="button"` preserved → Step 1 button JSX. ✓
- Click target stays the button only (no row hover/cursor-pointer) → Step 1 `<li>` has no hover or cursor classes added. ✓
- Non-admin and cancelled paths unaffected → covered by the existing `showNameGuest = !!onNameGuest && isGuestName(player)` gate and the `CancelledCard` path. Verified in Step 5. ✓

**Placeholder scan:** No TBDs, no "appropriate error handling", no "similar to Task N", no missing code. ✓

**Type consistency:** Single file, single task — no cross-task type drift possible.

---

Plan complete and saved to `docs/superpowers/plans/2026-05-12-guest-row-interactivity.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
