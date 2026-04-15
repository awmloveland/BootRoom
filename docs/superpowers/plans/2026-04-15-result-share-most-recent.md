# Result Share — Most-Recent Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "highlights baked into notes" with a share button shown only on the most recently resulted MatchCard, available to all members.

**Architecture:** Three targeted component edits — `ResultModal` stops appending highlights to `notes`, `MatchCard`/`PlayedCard` reverts its notes display and replaces its inline share-text builder with `buildResultShareText()` (gated on a new `weeks` prop), and `WeekList` makes the share props conditional on the most recently resulted card. One SQL cleanup for week 29.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Radix UI, Supabase

---

## File Map

| File | Change |
|---|---|
| `components/ResultModal.tsx` | Remove `combinedNotes`; write `notes.trim()` only to DB |
| `components/MatchCard.tsx` | Add `weeks?: Week[]` prop; revert notes display; replace `buildRetroShareText()` with `buildResultShareText()`; update share button gate |
| `components/WeekList.tsx` | Make `leagueName`, `shareGameId`, `weeks` conditional on `mostRecent` |
| SQL (Supabase dashboard) | `UPDATE weeks SET notes = NULL WHERE week = 29 AND game_id = '<your-game-id>'` |

---

## Task 1: Strip highlights from `ResultModal` notes write

**Files:**
- Modify: `components/ResultModal.tsx` (lines 222–253)

These are purely async/component changes with no extractable pure logic to unit-test. No test file needed for this task.

- [ ] **Step 1: Locate the `combinedNotes` variable in `handleSave`**

In `components/ResultModal.tsx`, find this block (around line 222):

```ts
const combinedNotes = notes.trim()
  ? notes.trim() + '\n\n' + highlightsText
  : highlightsText
```

- [ ] **Step 2: Replace `combinedNotes` with `notes.trim()` at both DB write sites**

Remove the `combinedNotes` variable and replace both usages with `notes.trim() || null`.

The two sites are the `publicMode` fetch body and the `supabase.rpc('record_result', ...)` call. The updated `handleSave` try-block should look like this (showing only the changed lines):

```ts
// Remove this block entirely:
// const combinedNotes = notes.trim()
//   ? notes.trim() + '\n\n' + highlightsText
//   : highlightsText

// publicMode path — change notes field:
body: JSON.stringify({
  weekId: scheduledWeek.id,
  winner,
  notes: notes.trim() || null,   // was: combinedNotes || null
  goalDifference: winner === 'draw' ? 0 : goalDifference,
  teamARating: teamAScore,
  teamBRating: teamBScore,
}),

// Supabase path — change p_notes:
const { error: resultErr } = await supabase.rpc('record_result', {
  p_week_id: scheduledWeek.id,
  p_winner: winner,
  p_notes: notes.trim() || null,  // was: combinedNotes || null
  p_goal_difference: winner === 'draw' ? 0 : goalDifference,
  p_team_a_rating: teamAScore,
  p_team_b_rating: teamBScore,
})
```

`buildResultShareText()` call and `onSaved({ winner, goalDifference, shareText, highlightsText })` are **unchanged** — `highlightsText` still goes to `ResultSuccessPanel`.

- [ ] **Step 3: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/ResultModal.tsx
git commit -m "fix: write user notes only to DB, stop appending highlights"
```

---

## Task 2: Revert `MatchCard` notes display and replace share builder

**Files:**
- Modify: `components/MatchCard.tsx`

No new pure logic to unit-test (replacing an inline helper with an already-tested utility). No test file needed.

- [ ] **Step 1: Add `weeks` to `PlayedCardProps` and `MatchCardProps`**

In `components/MatchCard.tsx`, add `weeks?: Week[]` to both interfaces:

```ts
// PlayedCardProps (around line 158):
interface PlayedCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  goalkeepers?: string[]
  isAdmin: boolean
  gameId: string
  allPlayers: Player[]
  onResultSaved: () => void
  leagueName?: string
  shareGameId?: string
  weeks?: Week[]          // ← add this
}

// MatchCardProps (around line 14):
interface MatchCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  goalkeepers?: string[]
  isAdmin?: boolean
  gameId?: string
  allPlayers?: Player[]
  onResultSaved?: () => void
  leagueName?: string
  shareGameId?: string
  weeks?: Week[]          // ← add this
}
```

- [ ] **Step 2: Thread `weeks` into `PlayedCard` from the public `MatchCard` export**

First, add `weeks` to the `MatchCard` function's destructured props (it already uses `MatchCardProps`):

```tsx
export function MatchCard({
  week,
  isOpen,
  onToggle,
  goalkeepers,
  isAdmin = false,
  gameId = '',
  allPlayers = [],
  onResultSaved = () => {},
  leagueName,
  shareGameId,
  weeks,          // ← add this
}: MatchCardProps) {
```

Then in the `MatchCard` function body, add `weeks` to the `PlayedCard` call:

```tsx
return (
  <PlayedCard
    week={week}
    isOpen={isOpen}
    onToggle={onToggle}
    goalkeepers={goalkeepers}
    isAdmin={isAdmin}
    gameId={gameId}
    allPlayers={allPlayers}
    onResultSaved={onResultSaved}
    leagueName={leagueName}
    shareGameId={shareGameId}
    weeks={weeks}           // ← add this
  />
)
```

- [ ] **Step 3: Add `weeks` to the `PlayedCard` destructure**

At the top of the `PlayedCard` function body, add `weeks` to the destructured props:

```ts
function PlayedCard({
  week,
  isOpen,
  onToggle,
  goalkeepers,
  isAdmin,
  gameId,
  allPlayers,
  onResultSaved,
  leagueName,
  shareGameId,
  weeks,          // ← add this
}: PlayedCardProps) {
```

- [ ] **Step 4: Replace `buildRetroShareText` with `buildResultShareText`**

Remove the entire `buildRetroShareText` function from `PlayedCard` (roughly lines 314–363). Replace the `handleShare` function with this version:

```ts
async function handleShare() {
  if (!leagueName || !shareGameId || !weeks || !week.winner) return
  try {
    const { shareText } = buildResultShareText({
      leagueName,
      leagueId: shareGameId,
      week: week.week,
      date: week.date,
      format: week.format ?? '',
      teamA: week.teamA ?? [],
      teamB: week.teamB ?? [],
      winner: week.winner,
      goalDifference: week.goal_difference ?? 0,
      teamARating: week.team_a_rating ?? 0,
      teamBRating: week.team_b_rating ?? 0,
      players: allPlayers,
      weeks,
    })
    if (navigator.share && window.innerWidth < 768) {
      try {
        await navigator.share({ text: shareText })
      } catch (err) {
        if (err instanceof DOMException && err.name !== 'AbortError') {
          try { await navigator.clipboard.writeText(shareText); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
        }
      }
    } else {
      try { await navigator.clipboard.writeText(shareText); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
    }
  } catch { /* ignore share errors */ }
}
```

`buildResultShareText` is already imported from `@/lib/utils` — confirm the import is present at the top of the file:

```ts
import { cn, shouldShowMeta, isPastDeadline, parseWeekDate, buildResultShareText } from '@/lib/utils'
```

Remove `parseWeekDate` from the import if it was only used by the old `buildRetroShareText`.

- [ ] **Step 5: Update share button gate to include `weeks`**

Find the share button (around line 477). Change the condition from `leagueName && shareGameId` to `leagueName && shareGameId && weeks`:

```tsx
{leagueName && shareGameId && weeks && (
  <button
    type="button"
    onClick={handleShare}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-700 text-slate-400 text-xs hover:border-slate-500 hover:text-slate-300 transition-colors"
  >
    <Share2 className="h-3 w-3" />
    {copied ? 'Copied!' : 'Share'}
  </button>
)}
```

Also update the meta section outer condition to include `weeks`:

```tsx
{(shouldShowMeta(week.goal_difference, week.notes) || isAdmin || (leagueName && shareGameId && !!weeks)) && (
```

- [ ] **Step 6: Revert notes display to simple italic text**

Find the notes block inside the meta section (the IIFE that splits on `\n\n`). Replace the entire IIFE with:

```tsx
{week.notes?.trim() && (
  <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-2 text-xs text-slate-400 italic w-full">
    {week.notes.trim()}
  </div>
)}
```

- [ ] **Step 7: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add components/MatchCard.tsx
git commit -m "feat: share button on most-recent card only, using full stats; revert notes display"
```

---

## Task 3: Scope `WeekList` share props to most-recently-resulted card

**Files:**
- Modify: `components/WeekList.tsx`

- [ ] **Step 1: Make share props conditional in the `MatchCard` render**

`WeekList` already computes `mostRecent` (line 34–36). In the `weeks.map(...)` block, change the `MatchCard` call from always-passing share props to conditional:

```tsx
<MatchCard
  week={week}
  isOpen={openWeek === week.week}
  onToggle={() => handleToggle(week.week)}
  goalkeepers={goalkeepers}
  isAdmin={isAdmin}
  gameId={gameId}
  allPlayers={allPlayers}
  onResultSaved={onResultSaved}
  leagueName={week.week === mostRecent?.week ? leagueName : undefined}
  shareGameId={week.week === mostRecent?.week ? gameId : undefined}
  weeks={week.week === mostRecent?.week ? weeks : undefined}
/>
```

`allPlayers` remains unconditional — it's needed by every card for admin result editing.

- [ ] **Step 2: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run the full test suite**

```bash
npm test -- --passWithNoTests
```

Expected: all tests pass (205 tests, zero failures).

- [ ] **Step 4: Commit**

```bash
git add components/WeekList.tsx
git commit -m "feat: scope share props to most-recently-resulted card in WeekList"
```

---

## Task 4: SQL cleanup — remove backfilled highlights from week 29

**Files:**
- Supabase SQL Editor (one-off, not a migration file)

- [ ] **Step 1: Find the game ID**

In the Supabase dashboard, run this query to confirm the week 29 row and its current notes:

```sql
SELECT id, game_id, week, notes
FROM weeks
WHERE week = 29;
```

Note the `game_id` value for The Boot Room league.

- [ ] **Step 2: Clear week 29 notes**

Run this query in the Supabase SQL Editor, substituting `<your-game-id>` with the value from step 1:

```sql
UPDATE weeks
SET notes = NULL
WHERE week = 29
  AND game_id = '<your-game-id>';
```

Expected: "1 row affected".

- [ ] **Step 3: Verify**

```sql
SELECT week, notes FROM weeks WHERE week = 29 AND game_id = '<your-game-id>';
```

Expected: `notes` is `null`.

---

## Verification

After all four tasks, manually verify the following in the running app:

1. Open the most recently resulted MatchCard — Share button is visible when expanded
2. Tap Share on mobile — native share sheet opens with full stat text (streaks, table, in-form)
3. Click Share on desktop — "Copied!" toast appears; paste into a text editor and confirm full stat text
4. Open any older MatchCard — no Share button visible
5. Open week 29 — notes field is empty (no auto-generated highlights showing)
6. Record a new result — notes field in DB contains only what the user typed (verify in Supabase)
7. `ResultSuccessPanel` still appears after saving and shows highlights correctly
