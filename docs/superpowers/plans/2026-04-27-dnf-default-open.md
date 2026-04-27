# DNF Card Default-Open Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the results tab expand the most recent DNF card by default, the same way it already expands the most recent played card.

**Architecture:** Single-line filter change in `ResultsSection.tsx` — replace `getPlayedWeeks()` (played-only) with an inline filter that includes both `played` and `dnf` statuses, matching the logic already used in `WeekList.tsx`.

**Tech Stack:** Next.js 14, TypeScript, React `useState`

---

### Task 1: Fix the default-open week initialization

**Files:**
- Modify: `components/ResultsSection.tsx:39-43`

- [ ] **Step 1: Apply the fix**

In `components/ResultsSection.tsx`, replace lines 39–43:

```ts
// Before
const [openWeek, setOpenWeek] = useState<number | null>(() => {
  const played = getPlayedWeeks(weeks)
  if (played.length === 0) return null
  return sortWeeks(played)[0].week
})
```

With:

```ts
// After
const [openWeek, setOpenWeek] = useState<number | null>(() => {
  const resulted = weeks.filter((w) => w.status === 'played' || w.status === 'dnf')
  if (resulted.length === 0) return null
  return sortWeeks(resulted)[0].week
})
```

The `getPlayedWeeks` import on line 5 can be removed if it is no longer used elsewhere in the file. Check for any other usages of `getPlayedWeeks` in `ResultsSection.tsx` before removing the import.

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Start the dev server (`npm run dev`) and open the results tab for a league where the most recent week is a DNF. Confirm:
- The DNF card is expanded on load
- Toggling it closed and then navigating away and back resets it to open again
- For a league where the most recent week is a played result, that card still opens by default (no regression)
- For a league with only scheduled/cancelled/unrecorded weeks, no card is expanded (openWeek = null)

- [ ] **Step 4: Commit**

```bash
git add components/ResultsSection.tsx
git commit -m "fix: expand most recent DNF card by default on results tab"
```
