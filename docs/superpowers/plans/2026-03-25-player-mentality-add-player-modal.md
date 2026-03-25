# Player Mentality Field — Add Player Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mentality segmented control (GK / DEF / BAL / ATT) to the new-player step of `AddPlayerModal`, replacing the dedicated goalkeeper toggle.

**Architecture:** Single-file change to `components/AddPlayerModal.tsx`. The `Mentality` type already exists in `lib/types.ts`. The segmented control is inlined, matching the style of `MentalityControl` in `PlayerRosterPanel.tsx`. The `goalkeeper` field on `NewPlayerEntry` is derived from `mentality === 'goalkeeper'` at submit time.

**Tech Stack:** React (useState), TypeScript, Tailwind CSS, `cn()` from `lib/utils.ts`

---

### Task 1: Replace the GK toggle with a mentality segmented control

**Files:**
- Modify: `components/AddPlayerModal.tsx`

The full replacement diff is below. Read each section carefully — every changed line is shown in context.

- [ ] **Step 1: Update the import line**

Replace the existing import at line 6:
```ts
import type { Player, GuestEntry, NewPlayerEntry } from '@/lib/types'
```
with:
```ts
import type { Player, GuestEntry, NewPlayerEntry, Mentality } from '@/lib/types'
```

- [ ] **Step 2: Remove `newPlayerIsGoalkeeper` state, add `newMentality` state**

Replace lines 32–34:
```ts
  const [guestIsGoalkeeper, setGuestIsGoalkeeper] = useState(false)
  const [newPlayerIsGoalkeeper, setNewPlayerIsGoalkeeper] = useState(false)
```
with:
```ts
  const [guestIsGoalkeeper, setGuestIsGoalkeeper] = useState(false)
  const [newMentality, setNewMentality] = useState<Mentality>('balanced')
```

- [ ] **Step 3: Update `handleAddNewPlayer` to derive `goalkeeper` from mentality**

Replace lines 68–73:
```ts
    onAdd({
      type: 'new_player',
      name: trimmed,
      rating: newRating,
      goalkeeper: newPlayerIsGoalkeeper,
    })
```
with:
```ts
    onAdd({
      type: 'new_player',
      name: trimmed,
      rating: newRating,
      goalkeeper: newMentality === 'goalkeeper',
    })
```

- [ ] **Step 4: Replace the GK toggle in the `new_player` JSX with the mentality control**

Replace the entire dedicated-goalkeeper `<div>` (lines 237–247):
```tsx
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      Dedicated goalkeeper
                    </label>
                    <p className="text-[11px] text-slate-400 leading-relaxed mt-px">
                      Plays in goal all game, every game.
                    </p>
                  </div>
                  <Toggle enabled={newPlayerIsGoalkeeper} onChange={(v) => setNewPlayerIsGoalkeeper(v)} />
                </div>
```
with:
```tsx
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Mentality
                  </label>
                  <div className="flex bg-slate-900 border border-slate-700 rounded-md overflow-hidden text-[10px] font-semibold">
                    {(
                      [
                        { value: 'goalkeeper', label: 'GK' },
                        { value: 'defensive',  label: 'DEF' },
                        { value: 'balanced',   label: 'BAL' },
                        { value: 'attacking',  label: 'ATT' },
                      ] as { value: Mentality; label: string }[]
                    ).map(({ value, label }, i) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => { if (value !== newMentality) setNewMentality(value) }}
                        className={cn(
                          'flex-1 py-1.5 transition-colors',
                          i < 3 && 'border-r',
                          value === newMentality
                            ? 'bg-blue-950 text-blue-300 border-blue-800'
                            : 'text-slate-500 border-slate-700 hover:text-slate-300'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    GK = dedicated goalkeeper, plays in goal every game.
                  </p>
                </div>
```

- [ ] **Step 5: Add `cn` import (if not already present)**

Check line 1–9 of the file. If `cn` is not already imported, add it:
```ts
import { cn } from '@/lib/utils'
```

- [ ] **Step 6: Reset `newMentality` on Back**

Replace line 253–254 (the Back button's onClick in the `new_player` footer):
```tsx
                  onClick={() => { setStep('choose'); setNewPlayerIsGoalkeeper(false) }}
```
with:
```tsx
                  onClick={() => { setStep('choose'); setNewMentality('balanced') }}
```

- [ ] **Step 7: Verify the file compiles with no TypeScript errors**

Run:
```bash
cd /Users/willloveland/conductor/workspaces/bootroom/brasilia && npx tsc --noEmit
```
Expected: no output (clean). If errors appear, check that `Mentality` is imported and the `cn` import is present.

- [ ] **Step 8: Commit**

```bash
git add components/AddPlayerModal.tsx
git commit -m "feat: replace GK toggle with mentality segmented control in add player modal"
```

---

## Self-Review Notes

- `Toggle` import remains — it is still used in the guest sub-flow (`guestIsGoalkeeper`). Do not remove it.
- `newPlayerIsGoalkeeper` is fully removed across state declaration, submit handler, and Back reset.
- `cn` is used for the segmented button classes — confirm it is imported from `@/lib/utils`.
- No API or type changes required — `NewPlayerEntry.goalkeeper` is already `boolean | undefined` and is correctly derived.
- Guest step is untouched.
