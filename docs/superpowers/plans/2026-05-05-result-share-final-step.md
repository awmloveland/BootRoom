# Result Modal Final Share Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken post-save `ResultSuccessPanel` with a new final "share" step inside `ResultModal`, firing for both standard results and DNFs and showing notes when present.

**Architecture:** Three coordinated changes — two new pure helpers in `lib/utils.ts` (`buildResultHeadline` and `formatShareDate`); a new terminal `'share'` step inside `ResultModal` with its own header / body / footer that consumes those helpers and the existing `buildResultShareText` / `buildDnfShareText`; and a parent-side cleanup in `NextMatchCard` that removes `ResultSuccessPanel` (the modal now owns the share moment for both result types).

**Tech Stack:** Next.js 14 (App Router), TypeScript (strict), Tailwind, Radix UI Dialog, Jest, lucide-react.

**Spec:** `docs/superpowers/specs/2026-05-05-result-share-final-step-design.md`

---

## File structure

| File | Purpose | Action |
|---|---|---|
| `lib/utils.ts` | Add `buildResultHeadline()` and `formatShareDate()` pure helpers | Modify |
| `lib/__tests__/utils.shareHeader.test.ts` | Unit tests for both new helpers | Create |
| `components/ResultModal.tsx` | Add `'share'` step to `ResultStep`, share-data state, share-step UI, save→share transition for both result types | Modify |
| `components/NextMatchCard.tsx` | Remove `ResultSuccessPanel` render + `savedResult` state, simplify `onSaved` handler to do unified cleanup | Modify |
| `components/ResultSuccessPanel.tsx` | Component superseded by in-modal share step | Delete |

---

## Task 1: Add `buildResultHeadline` helper

The header on the share step reads `Week 14 — Team A Wins! (+2 goals)`. The result-phrase portion (`Team A Wins! (+2 goals)`) is a pure function of `(winner, goalDifference, isDnf)`. Singular/plural matters: `(+1 goal)` not `(+1 goals)`.

**Files:**
- Modify: `lib/utils.ts`
- Create: `lib/__tests__/utils.shareHeader.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/utils.shareHeader.test.ts` with the following content:

```ts
import { buildResultHeadline, formatShareDate } from '../utils'

describe('buildResultHeadline', () => {
  it('formats a Team A win with plural goals', () => {
    expect(buildResultHeadline('teamA', 2, false)).toBe('Team A Wins! (+2 goals)')
  })

  it('formats a Team A win with singular goal', () => {
    expect(buildResultHeadline('teamA', 1, false)).toBe('Team A Wins! (+1 goal)')
  })

  it('formats a Team B win with plural goals', () => {
    expect(buildResultHeadline('teamB', 3, false)).toBe('Team B Wins! (+3 goals)')
  })

  it('formats a Team B win with singular goal', () => {
    expect(buildResultHeadline('teamB', 1, false)).toBe('Team B Wins! (+1 goal)')
  })

  it('formats a draw without margin', () => {
    expect(buildResultHeadline('draw', 0, false)).toBe('Draw')
  })

  it('formats DNF regardless of winner / margin inputs', () => {
    expect(buildResultHeadline(null, 0, true)).toBe('Did Not Finish')
    expect(buildResultHeadline('teamA', 5, true)).toBe('Did Not Finish')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- utils.shareHeader.test.ts
```

Expected: FAIL — `buildResultHeadline is not a function` (or import error).

- [ ] **Step 3: Add the helper to `lib/utils.ts`**

Append to the bottom of `lib/utils.ts` (after the existing exports):

```ts
/**
 * Result-phrase portion of the share-step header, e.g. "Team A Wins! (+2 goals)".
 * Singular goal handled. DNF takes priority over winner inputs.
 */
export function buildResultHeadline(
  winner: Winner,
  goalDifference: number,
  isDnf: boolean
): string {
  if (isDnf) return 'Did Not Finish'
  if (winner === 'draw') return 'Draw'
  if (winner === 'teamA' || winner === 'teamB') {
    const teamLabel = winner === 'teamA' ? 'Team A' : 'Team B'
    const goalWord = goalDifference === 1 ? 'goal' : 'goals'
    return `${teamLabel} Wins! (+${goalDifference} ${goalWord})`
  }
  return ''
}
```

`Winner` is already imported at the top of `lib/utils.ts` from `./types`.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- utils.shareHeader.test.ts
```

Expected: PASS — 6 of 6 `buildResultHeadline` tests passing. (`formatShareDate` tests are added in Task 2.)

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.shareHeader.test.ts
git commit -m "feat(utils): add buildResultHeadline helper for share step"
```

---

## Task 2: Add `formatShareDate` helper

`scheduledWeek.date` is `YYYY-MM-DD`; the share step displays `DD MMM YYYY` (e.g. `05 May 2026`). Pure string transform — no `Date` object timezone concerns: parse the three components and look up the month abbreviation.

**Files:**
- Modify: `lib/utils.ts`
- Modify: `lib/__tests__/utils.shareHeader.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `lib/__tests__/utils.shareHeader.test.ts`:

```ts
describe('formatShareDate', () => {
  it('formats a YYYY-MM-DD date as DD MMM YYYY', () => {
    expect(formatShareDate('2026-05-05')).toBe('05 May 2026')
  })

  it('zero-pads single-digit days', () => {
    expect(formatShareDate('2026-01-09')).toBe('09 Jan 2026')
  })

  it('handles end-of-year dates', () => {
    expect(formatShareDate('2026-12-31')).toBe('31 Dec 2026')
  })

  it('returns the input unchanged when not in YYYY-MM-DD form', () => {
    expect(formatShareDate('not-a-date')).toBe('not-a-date')
    expect(formatShareDate('')).toBe('')
  })
})
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

```bash
npm test -- utils.shareHeader.test.ts
```

Expected: FAIL on the four `formatShareDate` tests — `formatShareDate is not a function`. The 6 `buildResultHeadline` tests still pass.

- [ ] **Step 3: Add the helper to `lib/utils.ts`**

Append below `buildResultHeadline`:

```ts
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Reformats a YYYY-MM-DD date string as `DD MMM YYYY` (e.g. "05 May 2026").
 * Returns the input unchanged if it does not match the expected format.
 */
export function formatShareDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return date
  const [, year, monthStr, day] = match
  const monthIndex = parseInt(monthStr, 10) - 1
  if (monthIndex < 0 || monthIndex > 11) return date
  return `${day} ${SHORT_MONTHS[monthIndex]} ${year}`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- utils.shareHeader.test.ts
```

Expected: PASS — all 10 tests in the file passing.

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.shareHeader.test.ts
git commit -m "feat(utils): add formatShareDate helper for share step header"
```

---

## Task 3: Extend `ResultModal` types and state for the share step

Type-only / state-only changes. No UI changes yet — the modal still behaves identically to today after this task because we don't yet `setStep('share')` from anywhere. This sets up the scaffolding so the next two tasks can land cleanly.

**Files:**
- Modify: `components/ResultModal.tsx`

- [ ] **Step 1: Update imports**

At `components/ResultModal.tsx:6`, change:

```ts
import { cn, ewptScore, buildResultShareText } from '@/lib/utils'
```

to (keep on one line for diff cleanliness):

```ts
import { cn, ewptScore, buildResultShareText, buildDnfShareText, buildResultHeadline, formatShareDate } from '@/lib/utils'
```

- [ ] **Step 2: Add the X / Share2 icon imports**

After the existing `import { Toggle } from '@/components/ui/toggle'` line (around `:10`), add:

```ts
import { X, Share2 } from 'lucide-react'
```

- [ ] **Step 3: Widen the `ResultStep` union**

At `components/ResultModal.tsx:29`, change:

```ts
type ResultStep = 'winner' | 'review' | 'confirm'
```

to:

```ts
type ResultStep = 'winner' | 'review' | 'confirm' | 'share'
```

- [ ] **Step 4: Add the `ShareData` type and state**

Inside the `ResultModal` function body, just below the existing `const [isDnf, setIsDnf] = useState(false)` line (around `:107`), add:

```ts
type ShareData =
  | { dnf: false; winner: NonNullable<Winner>; goalDifference: number; shareText: string; highlightsText: string }
  | { dnf: true; shareText: string }
const [shareData, setShareData] = useState<ShareData | null>(null)
const [shareCopied, setShareCopied] = useState(false)
```

- [ ] **Step 5: Update `totalSteps` and `currentStepNum` to account for the share step**

At `components/ResultModal.tsx:99`, change:

```ts
const totalSteps = hasReviewStep ? 3 : 1
```

to:

```ts
const totalSteps = hasReviewStep ? 4 : 2
```

At `components/ResultModal.tsx:346`, change:

```ts
const currentStepNum = step === 'winner' ? 1 : step === 'review' ? 2 : 3
```

to:

```ts
const currentStepNum = step === 'winner' ? 1 : step === 'review' ? 2 : step === 'confirm' ? 3 : totalSteps
```

- [ ] **Step 6: Hide the step indicator on the share step**

At `components/ResultModal.tsx:364`, change:

```tsx
{hasReviewStep && <StepIndicator current={currentStepNum} total={totalSteps} />}
```

to:

```tsx
{hasReviewStep && step !== 'share' && <StepIndicator current={currentStepNum} total={totalSteps} />}
```

- [ ] **Step 7: Verify the project still type-checks and existing tests pass**

```bash
npm run lint && npm test -- utils.shareHeader.test.ts
```

Expected: PASS — no new lint errors from the ResultModal changes (unused `setShareData`, `setShareCopied`, `Share2`, `X`, `buildDnfShareText`, `buildResultHeadline`, `formatShareDate` may be flagged; if so the next two tasks resolve them, but the change should still compile).

If `npm run lint` flags unused imports as errors, suppress them by leaving them in place — they will all be consumed in Tasks 4 and 5. If lint is configured to error on unused, run `npm test` instead to confirm there are no runtime regressions.

- [ ] **Step 8: Commit**

```bash
git add components/ResultModal.tsx
git commit -m "refactor(ResultModal): add 'share' step type and state scaffolding"
```

---

## Task 4: Render the share step UI in `ResultModal`

Adds the share-step JSX block. The block consumes `shareData` (which is still always `null` after this task), so the new UI never renders yet — the next task wires the transition that populates `shareData` and calls `setStep('share')`.

This task also updates the modal header to vary its title/description by step and adds an X close button on the share step (the X is share-step-only — winner/review/confirm headers are unchanged).

**Files:**
- Modify: `components/ResultModal.tsx`

- [ ] **Step 1: Update the modal header to vary by step**

At `components/ResultModal.tsx:354-362`, replace:

```tsx
{/* Header */}
<div className="px-5 pt-4 pb-3 border-b border-slate-700">
  <Dialog.Title className="text-base font-semibold text-slate-100">
    Result — Week {scheduledWeek.week}
  </Dialog.Title>
  <Dialog.Description className="text-xs text-slate-400 mt-0.5">
    {scheduledWeek.date}
  </Dialog.Description>
</div>
```

with:

```tsx
{/* Header */}
<div className="px-5 pt-4 pb-3 border-b border-slate-700 flex items-start justify-between gap-3">
  <div className="flex-1 min-w-0">
    <Dialog.Title className="text-base font-semibold text-slate-100">
      {step === 'share' && shareData
        ? `Week ${scheduledWeek.week} — ${buildResultHeadline(
            shareData.dnf ? null : shareData.winner,
            shareData.dnf ? 0 : shareData.goalDifference,
            shareData.dnf
          )}`
        : `Result — Week ${scheduledWeek.week}`}
    </Dialog.Title>
    <Dialog.Description className="text-xs text-slate-400 mt-0.5">
      {step === 'share' ? formatShareDate(scheduledWeek.date) : scheduledWeek.date}
    </Dialog.Description>
  </div>
  {step === 'share' && (
    <Dialog.Close asChild>
      <button
        type="button"
        aria-label="Close"
        className="text-slate-500 hover:text-slate-300 p-1 rounded transition-colors flex-shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </Dialog.Close>
  )}
</div>
```

- [ ] **Step 2: Add the share step render block**

At `components/ResultModal.tsx`, find the closing `)}` of the `step === 'confirm' && (...)` block (around `:637`). Insert the following block immediately after that closing `)}` (and before the `</Dialog.Content>` closing tag at `:639`):

```tsx
          {/* ── Step: share ── */}
          {step === 'share' && shareData && (
            <>
              <div className="p-5 flex flex-col gap-2 max-h-[70vh] overflow-y-auto">
                {/* Team A */}
                <div className="bg-slate-900 border border-blue-900/50 rounded-lg p-3">
                  <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide mb-2">🔵 Team A</p>
                  <p className="text-xs text-slate-300 leading-relaxed">{scheduledWeek.teamA.join(', ')}</p>
                </div>

                {/* Team B */}
                <div className="bg-slate-900 border border-violet-900/50 rounded-lg p-3">
                  <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide mb-2">🟣 Team B</p>
                  <p className="text-xs text-slate-300 leading-relaxed">{scheduledWeek.teamB.join(', ')}</p>
                </div>

                {/* Highlights — non-DNF only, when text non-empty */}
                {!shareData.dnf && shareData.highlightsText.trim().length > 0 && (
                  <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Highlights</p>
                    <div className="flex flex-col gap-1.5">
                      {shareData.highlightsText
                        .split('\n')
                        .map((l) => l.trim())
                        .filter(Boolean)
                        .map((line) => (
                          <p key={line} className="text-xs text-slate-300">{line}</p>
                        ))}
                    </div>
                  </div>
                )}

                {/* Notes — both result types, when present */}
                {notes.trim().length > 0 && (
                  <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Notes</p>
                    <p className="text-xs text-slate-300 italic leading-relaxed">{notes.trim()}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 px-5 pb-5 pt-1">
                <button
                  type="button"
                  onClick={handleShareClick}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
                >
                  <Share2 className="h-4 w-4" />
                  {shareCopied ? 'Result copied!' : 'Share Result'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-lg border border-slate-600 text-slate-300 text-sm hover:border-slate-500 transition-colors"
                >
                  Done
                </button>
              </div>
            </>
          )}
```

The `Done` button is wired to `onClose` for now; Task 5 changes it to call `onSaved` once the dismissal semantics are flipped.

- [ ] **Step 3: Add `handleShareClick` near the other handlers**

Find `handleSave` (at `components/ResultModal.tsx:166`). Just above it, add:

```ts
async function handleShareClick() {
  if (!shareData) return
  const text = shareData.shareText
  if (typeof navigator !== 'undefined' && navigator.share && window.innerWidth < 768) {
    try {
      await navigator.share({ text })
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      // fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  } catch {
    // clipboard unavailable — nothing to do
  }
}
```

This mirrors the share handler in `ResultSuccessPanel.tsx` and `MatchCard.tsx`'s `PlayedCard` / `DnfCard`.

- [ ] **Step 4: Verify lint passes**

```bash
npm run lint
```

Expected: PASS — no errors. (Some unused-symbol warnings on `setShareData` may persist; Task 5 wires it.)

If TypeScript flags the share render block (e.g. for the discriminated-union narrowing on `shareData`), the most likely culprit is the access to `shareData.highlightsText` outside the `!shareData.dnf` branch — make sure the access is inside that conditional.

- [ ] **Step 5: Commit**

```bash
git add components/ResultModal.tsx
git commit -m "feat(ResultModal): render share step UI (not yet wired)"
```

---

## Task 5: Wire save → share transition and remove the standalone success panel

This is the behaviour change. After this task:

- Saving a non-DNF result transitions the modal into the share step instead of closing it.
- Saving a DNF result transitions the modal into the share step instead of closing it.
- `onSaved` semantically means "user finished the flow" rather than "result was saved" — it fires when the user dismisses the share step (Done button, X button, escape, or overlay click). The payload becomes `void`.
- `NextMatchCard` no longer renders `ResultSuccessPanel`, no longer holds `savedResult` state, and its `onSaved` handler does the unified cleanup for both result types.

Touches both files atomically because the `onSaved` signature changes.

**Files:**
- Modify: `components/ResultModal.tsx`
- Modify: `components/NextMatchCard.tsx`

- [ ] **Step 1: Simplify the `onSaved` prop type and remove the exported payload**

At `components/ResultModal.tsx:12-14`, remove the exported `ResultSavedPayload` type:

```ts
export type ResultSavedPayload =
  | { dnf: false; winner: NonNullable<Winner>; goalDifference: number; shareText: string; highlightsText: string }
  | { dnf: true }
```

At `components/ResultModal.tsx:25`, change:

```ts
onSaved: (result: ResultSavedPayload) => void
```

to:

```ts
onSaved: () => void
```

- [ ] **Step 2: Wire the save → share transition for the non-DNF path**

At `components/ResultModal.tsx:338`, the line currently reads:

```ts
onSaved({ dnf: false, winner, goalDifference, shareText, highlightsText })
```

Replace it with:

```ts
setShareData({ dnf: false, winner, goalDifference, shareText, highlightsText })
setStep('share')
```

- [ ] **Step 3: Wire the save → share transition for the DNF path**

At `components/ResultModal.tsx:221`, the DNF branch currently calls:

```ts
onSaved({ dnf: true })
return
```

Replace it with code that builds the DNF share text and transitions to the share step. Find the `if (isDnf) {` block (around `:172`); the current end of the block is `onSaved({ dnf: true }); return`. Replace those two lines with:

```ts
const dnfShareText = buildDnfShareText({
  leagueName,
  leagueSlug,
  week: scheduledWeek.week,
  date: scheduledWeek.date,
  format: scheduledWeek.format ?? '',
  teamA: scheduledWeek.teamA,
  teamB: scheduledWeek.teamB,
  teamARating: null,
  teamBRating: null,
  notes: notes.trim(),
})
setShareData({ dnf: true, shareText: dnfShareText })
setStep('share')
return
```

The `teamARating` / `teamBRating` are passed as `null` because the DNF branch in this modal never computes ratings (it doesn't run `ewptScore`). Already-saved DNFs that re-share via `DnfCard` consult `week.team_a_rating` directly from the row, which is unaffected.

- [ ] **Step 4: Route share-step dismissal to `onSaved`**

The current `Dialog.Root` dismissal handler at `components/ResultModal.tsx:349` is:

```tsx
<Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
```

Change to route share-step dismissals to `onSaved`:

```tsx
<Dialog.Root open onOpenChange={(open) => { if (!open) { if (step === 'share') onSaved(); else onClose() } }}>
```

Update the share step's `Done` button (added in Task 4 Step 2) to call `onSaved` instead of `onClose`. In the share-step JSX block, change:

```tsx
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-lg border border-slate-600 text-slate-300 text-sm hover:border-slate-500 transition-colors"
                >
                  Done
                </button>
```

to:

```tsx
                <button
                  type="button"
                  onClick={onSaved}
                  className="px-4 py-2.5 rounded-lg border border-slate-600 text-slate-300 text-sm hover:border-slate-500 transition-colors"
                >
                  Done
                </button>
```

The `Cancel` button on Step 1 (winner) and `Back` buttons on Steps 2/3 are unchanged — they still call `onClose` / `setStep` respectively.

- [ ] **Step 5: Update `NextMatchCard` — remove the `ResultSavedPayload` import**

At `components/NextMatchCard.tsx:15`, remove the line:

```ts
import type { ResultSavedPayload } from '@/components/ResultModal'
```

- [ ] **Step 6: Update `NextMatchCard` — remove the `ResultSuccessPanel` import**

At `components/NextMatchCard.tsx:16`, remove the line:

```ts
import { ResultSuccessPanel } from '@/components/ResultSuccessPanel'
```

- [ ] **Step 7: Update `NextMatchCard` — remove the `savedResult` state**

At `components/NextMatchCard.tsx:175`, remove the line:

```ts
const [savedResult, setSavedResult] = useState<Extract<ResultSavedPayload, { dnf: false }> | null>(null)
```

- [ ] **Step 8: Update `NextMatchCard` — simplify the `onSaved` handler**

At `components/NextMatchCard.tsx:1095-1106`, the current handler is:

```tsx
onSaved={(result) => {
  setShowResultModal(false)
  setGuestEntries([])
  setNewPlayerEntries([])
  if (result.dnf) {
    setScheduledWeek(null)
    setCardState('idle')
    onResultSaved()
  } else {
    setSavedResult(result)
  }
}}
```

Replace with a unified cleanup path:

```tsx
onSaved={() => {
  setShowResultModal(false)
  setGuestEntries([])
  setNewPlayerEntries([])
  setScheduledWeek(null)
  setCardState('idle')
  onResultSaved()
}}
```

- [ ] **Step 9: Update `NextMatchCard` — remove the `ResultSuccessPanel` render block**

At `components/NextMatchCard.tsx:1111-1128`, remove the entire block:

```tsx
{savedResult && scheduledWeek && (
  <ResultSuccessPanel
    week={scheduledWeek.week}
    date={scheduledWeek.date}
    winner={savedResult.winner}
    goalDifference={savedResult.goalDifference}
    teamA={scheduledWeek.teamA}
    teamB={scheduledWeek.teamB}
    highlightsText={savedResult.highlightsText}
    shareText={savedResult.shareText}
    onDismiss={() => {
      setSavedResult(null)
      setScheduledWeek(null)
      setCardState('idle')
      onResultSaved()
    }}
  />
)}
```

- [ ] **Step 10: Verify lint, type-check, and tests pass**

```bash
npm run lint && npm test
```

Expected: PASS for everything. Existing test files (`utils.winCopy.test.ts` etc.) are unchanged. The new `utils.shareHeader.test.ts` from Tasks 1–2 still passes. No component tests cover the removed panel.

If TypeScript complains about `setShareData` or related symbols being unused, double-check they are referenced in the share-step JSX block from Task 4.

- [ ] **Step 11: Commit**

```bash
git add components/ResultModal.tsx components/NextMatchCard.tsx
git commit -m "feat(ResultModal): wire save→share transition, retire ResultSuccessPanel"
```

---

## Task 6: Delete `ResultSuccessPanel.tsx`

`ResultSuccessPanel` is no longer imported by any file (Task 5 removed the only consumer in `NextMatchCard`). A grep confirmed there are no other references in the codebase. Safe to delete.

**Files:**
- Delete: `components/ResultSuccessPanel.tsx`

- [ ] **Step 1: Verify there are no remaining references**

```bash
grep -r "ResultSuccessPanel" --include="*.tsx" --include="*.ts" .
```

Expected: matches only in `docs/superpowers/specs/...` and `docs/superpowers/plans/...` (historical documentation), no source-code references. If any source file still imports it, finish Task 5 before proceeding.

- [ ] **Step 2: Delete the file**

```bash
rm components/ResultSuccessPanel.tsx
```

- [ ] **Step 3: Verify lint and tests still pass**

```bash
npm run lint && npm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/ResultSuccessPanel.tsx
git commit -m "chore: remove ResultSuccessPanel (superseded by in-modal share step)"
```

---

## Task 7: Manual verification

The share step is interactive and visually distinctive — automated tests don't cover the integration path (modal step transitions, share button copy state, native share fallback). Manually walk the flow.

**Files:** None (manual QA).

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Open `http://localhost:3000/app/league/<your-league-id>` (or use a public link the same way).

- [ ] **Step 2: Verify the no-review flow (Flow B)**

1. Pick or create a scheduled week with no guests and no new players.
2. Click "Record Result", pick a winner, set a margin, optionally add notes.
3. Click "Confirm Result".
4. Expected: the modal does not close. The header changes to `Week N — Team A Wins! (+M goals)` (or "Draw" / "Team B Wins! (+M goals)") with the date in `DD MMM YYYY` format. The body shows the two team grids. The Highlights block appears if any highlights were generated for this result. If you entered notes, the Notes block appears below.
5. Click "Share Result". Expected: button label flips to "Result copied!" for ~2s on desktop; on mobile, the native share sheet opens.
6. Click "Done". Expected: the modal closes and the just-played week now appears in the played-cards list.

- [ ] **Step 3: Verify the with-review flow (Flow A)**

1. Pick or create a scheduled week that includes guests and/or new players.
2. Walk through Steps 1 (winner) → 2 (review) → 3 (confirm). Step indicator dots show 1 of 4 / 2 of 4 / 3 of 4 across the steps.
3. Click "Save result" on the confirm step.
4. Expected: the modal stays open and lands on the share step. Step indicator dots are hidden on this step. The X close button appears in the top-right corner of the header.
5. Click "Share Result", confirm clipboard / share-sheet behaviour, then "Done".
6. Expected: modal closes, week appears in played-cards list with guest/new-player roster updates applied.

- [ ] **Step 4: Verify the DNF flow (Flow C)**

1. On a scheduled week, click "Record Result" → pick "DNF".
2. Optionally enter notes (e.g. "Pitch was waterlogged.").
3. Click "Confirm Result".
4. Expected: the modal stays open and lands on the share step. Header reads `Week N — Did Not Finish`. Body shows the two team grids and the Notes block (if notes were entered). No Highlights block.
5. Click "Share Result". Expected: clipboard contains the DNF-formatted share text from `buildDnfShareText`.
6. Click "Done". Expected: the modal closes and the DNF card now renders for the week.

- [ ] **Step 5: Verify dismissal paths**

In each of the three flows above, repeat the sequence and dismiss the share step three different ways: (a) the X button in the header, (b) pressing Escape, (c) clicking the dark overlay. Expected: in all three cases the modal closes and the week appears in the played-or-DNF list — same outcome as clicking Done.

- [ ] **Step 6: Verify error handling on save**

Temporarily kill your network or simulate a save error (easiest: open the browser dev tools network tab, set offline, then try to save). Expected: an error message appears under the Confirm step (or the no-review Step 1) and the modal does NOT advance to the share step. Restore the network and confirm a retry succeeds and lands on the share step.

- [ ] **Step 7: Final commit if anything was tweaked during QA**

```bash
git status
```

If clean: nothing to commit. If you tweaked anything in response to QA findings, commit those changes with a message describing the fix.

---

## Self-review notes

Spec coverage check:

- Step flow (`winner → share` no-review, `winner → review → confirm → share` with-review): Tasks 3 (totalSteps + currentStepNum) + 5 (transition).
- Step indicator hidden on share step: Task 3 Step 6.
- Layout — title, date, X, vertical teams, conditional Highlights, conditional Notes, 50/50 footer with Share Result + Done: Task 4.
- DNF share moment with `buildDnfShareText`: Task 5 Step 3.
- `setStep('share')` only after RPC success: Task 5 Steps 2 and 3 — both inside the `try` block, after the network calls succeed; the `catch` keeps the user on the prior step with the existing red error text.
- `onSaved` semantics change to "user dismissed share step": Task 5 Steps 1 + 4 + 8.
- `ResultSavedPayload` type removed: Task 5 Step 1.
- `ResultSuccessPanel` deleted: Task 6.
- `buildResultHeadline` and `formatShareDate` helpers + tests: Tasks 1 and 2.
- Manual UI verification across all three flows: Task 7.

No remaining placeholders, no "TBD" steps, no missing code blocks.
