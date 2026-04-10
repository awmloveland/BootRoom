# Share Lineup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Share button to the scheduled week card that sends formatted team info (names, ratings, win prediction, link) as plain text to any messaging app.

**Architecture:** A pure `buildShareText()` utility in `lib/utils.ts` generates the formatted string from week data. `NextMatchCard` gains a `leagueName` prop and a share button in the lineup footer — visible to all members once a lineup is saved. On mobile the native share sheet opens; on desktop the text copies to clipboard with a brief "Copied!" label.

**Tech Stack:** React `useState`, Web Share API (`navigator.share`), Clipboard API (`navigator.clipboard`), `lucide-react` (`Share2`), existing `winProbability()` + `winCopy()` + `parseWeekDate()` utilities.

---

### Task 1: Add `buildShareText()` utility + tests

**Files:**
- Modify: `lib/utils.ts` (add `DAY_SHORT` constant and `buildShareText()` after `winCopy`)
- Modify: `lib/__tests__/utils.winCopy.test.ts` (append `buildShareText` describe block)

- [ ] **Step 1: Write the failing tests**

Append to `lib/__tests__/utils.winCopy.test.ts`:

```ts
import { winCopy, buildShareText } from '../utils'

// ... existing tests unchanged ...

describe('buildShareText', () => {
  const base = {
    leagueName: 'The Boot Room',
    leagueId: 'abc123',
    week: 23,
    date: '10 Apr 2026',
    format: '6-a-side',
    teamA: ['Marcus', 'Jordan', 'Diego', 'Liam', 'Tom', 'Alex'],
    teamB: ['Sam', 'Kai', 'Jake', 'Rory', 'Ben', 'Chris'],
    teamARating: 72.4,
    teamBRating: 68.9,
  }

  it('includes the league name and week number', () => {
    const text = buildShareText(base)
    expect(text).toContain('The Boot Room')
    expect(text).toContain('Week 23')
  })

  it('includes the format and a short date with day name', () => {
    const text = buildShareText(base)
    // 10 Apr 2026 is a Friday
    expect(text).toContain('Fri 10 Apr')
    expect(text).toContain('6-a-side')
  })

  it('includes team A player names joined by comma', () => {
    const text = buildShareText(base)
    expect(text).toContain('Marcus, Jordan, Diego, Liam, Tom, Alex')
  })

  it('includes team B player names joined by comma', () => {
    const text = buildShareText(base)
    expect(text).toContain('Sam, Kai, Jake, Rory, Ben, Chris')
  })

  it('formats ratings to one decimal place', () => {
    const text = buildShareText(base)
    expect(text).toContain('72.4')
    expect(text).toContain('68.9')
  })

  it('includes a win prediction line', () => {
    const text = buildShareText(base)
    // 72.4 vs 68.9 — Team A should be favoured
    expect(text).toContain('📊')
    expect(text).toMatch(/Team A/)
  })

  it('includes the public league URL', () => {
    const text = buildShareText(base)
    expect(text).toContain('https://craft-football.com/abc123')
  })

  it('shows "Too close to call" copy for equal ratings', () => {
    const text = buildShareText({ ...base, teamARating: 70, teamBRating: 70 })
    expect(text).toContain('Too close to call')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest utils.winCopy --no-coverage
```

Expected: `Cannot find name 'buildShareText'` or similar import error.

- [ ] **Step 3: Add `DAY_SHORT` constant and `buildShareText()` to `lib/utils.ts`**

Add `DAY_SHORT` immediately after the `MONTH_SHORT` line (currently line 165):

```ts
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
```

Add `buildShareText()` immediately after the `winCopy` function (currently ends around line 163):

```ts
/**
 * Builds a formatted plain-text share message for a saved lineup.
 * Suitable for pasting into WhatsApp, iMessage, or any messaging app.
 */
export function buildShareText(params: {
  leagueName: string
  leagueId: string
  week: number
  date: string        // 'DD MMM YYYY' — the canonical app date format
  format: string
  teamA: string[]
  teamB: string[]
  teamARating: number
  teamBRating: number
}): string {
  const { leagueName, leagueId, week, date, format, teamA, teamB, teamARating, teamBRating } = params
  const parsed = parseWeekDate(date)
  const [dd, mmm] = date.split(' ')
  const shortDate = `${DAY_SHORT[parsed.getDay()]} ${dd} ${mmm}`
  const prob = winProbability(teamARating, teamBRating)
  const { text: prediction } = winCopy(prob)
  return [
    `⚽ ${leagueName} — Week ${week}`,
    `📅 ${shortDate} · ${format}`,
    '',
    `🔵 Team A (${teamARating.toFixed(1)})`,
    teamA.join(', '),
    '',
    `🟣 Team B (${teamBRating.toFixed(1)})`,
    teamB.join(', '),
    '',
    `📊 ${prediction}`,
    '',
    `🔗 https://craft-football.com/${leagueId}`,
  ].join('\n')
}
```

Note: `parseWeekDate` and `winProbability` / `winCopy` are already defined earlier in the same file — no imports needed.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest utils.winCopy --no-coverage
```

Expected: All tests pass, including the new `buildShareText` describe block.

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.winCopy.test.ts
git commit -m "feat: add buildShareText() utility for lineup sharing"
```

---

### Task 2: Thread `leagueName` prop through wrapper components

`NextMatchCard` currently receives `gameId` but not the league's display name. All three callers already have access to `game.name` from the server — they just need to pass it down.

**Files:**
- Modify: `components/NextMatchCard.tsx` (add `leagueName` to Props interface and destructuring)
- Modify: `components/ResultsSection.tsx` (add `leagueName` to Props, pass to `NextMatchCard`)
- Modify: `components/ResultsRefresher.tsx` (add `leagueName` to Props, pass to `NextMatchCard`)
- Modify: `components/PublicMatchEntrySection.tsx` (add `leagueName` to Props, pass to `NextMatchCard`)
- Modify: `app/[leagueId]/results/page.tsx` (pass `game!.name` to all three wrappers)

- [ ] **Step 1: Add `leagueName` to `NextMatchCard` Props**

In `components/NextMatchCard.tsx`, add to the `Props` interface (after `leagueDayIndex`):

```ts
interface Props {
  gameId: string
  weeks: Week[]
  onResultSaved: () => void
  canEdit?: boolean
  publicMode?: boolean
  initialScheduledWeek?: ScheduledWeek | null
  canAutoPick?: boolean
  allPlayers?: Player[]
  onBuildStart?: () => void
  leagueDayIndex?: number
  /** Display name of the league — used to build the share text. */
  leagueName?: string
}
```

Add `leagueName = ''` to the destructuring at line 106:

```ts
export function NextMatchCard({
  gameId,
  weeks,
  onResultSaved,
  canEdit = true,
  publicMode = false,
  initialScheduledWeek,
  canAutoPick = false,
  allPlayers = [],
  onBuildStart,
  leagueDayIndex,
  leagueName = '',
}: Props) {
```

- [ ] **Step 2: Update `ResultsSection`**

In `components/ResultsSection.tsx`, add `leagueName` to the Props interface and pass it through:

```ts
interface Props {
  gameId: string
  weeks: Week[]
  goalkeepers: string[]
  initialScheduledWeek: ScheduledWeek | null
  canAutoPick: boolean
  allPlayers: Player[]
  showMatchHistory: boolean
  leagueDayIndex?: number
  isAdmin?: boolean
  leagueName?: string
}

export function ResultsSection({
  gameId,
  weeks,
  goalkeepers,
  initialScheduledWeek,
  canAutoPick,
  allPlayers,
  showMatchHistory,
  leagueDayIndex,
  isAdmin = false,
  leagueName,
}: Props) {
```

In the JSX, add `leagueName={leagueName}` to `<NextMatchCard>`:

```tsx
<NextMatchCard
  gameId={gameId}
  weeks={weeks}
  initialScheduledWeek={initialScheduledWeek}
  onResultSaved={() => router.refresh()}
  canEdit={true}
  canAutoPick={canAutoPick}
  allPlayers={allPlayers}
  onBuildStart={handleBuildStart}
  leagueDayIndex={leagueDayIndex}
  leagueName={leagueName}
/>
```

- [ ] **Step 3: Update `ResultsRefresher`**

In `components/ResultsRefresher.tsx`:

```ts
interface Props {
  gameId: string
  weeks: Week[]
  initialScheduledWeek: ScheduledWeek | null
  canEdit: boolean
  canAutoPick: boolean
  allPlayers: Player[]
  leagueName?: string
}

export function ResultsRefresher({ gameId, weeks, initialScheduledWeek, canEdit, canAutoPick, allPlayers, leagueName }: Props) {
  const router = useRouter()
  return (
    <NextMatchCard
      gameId={gameId}
      weeks={weeks}
      initialScheduledWeek={initialScheduledWeek}
      onResultSaved={() => router.refresh()}
      canEdit={canEdit}
      canAutoPick={canAutoPick}
      allPlayers={allPlayers}
      onBuildStart={() => {}}
      leagueName={leagueName}
    />
  )
}
```

- [ ] **Step 4: Update `PublicMatchEntrySection`**

In `components/PublicMatchEntrySection.tsx`:

```ts
interface Props {
  gameId: string
  weeks: Week[]
  initialScheduledWeek: ScheduledWeek | null
  leagueName?: string
}

export function PublicMatchEntrySection({ gameId, weeks, initialScheduledWeek, leagueName }: Props) {
  return (
    <NextMatchCard
      gameId={gameId}
      weeks={weeks}
      publicMode={true}
      initialScheduledWeek={initialScheduledWeek}
      canEdit={true}
      onResultSaved={() => window.location.reload()}
      leagueName={leagueName}
    />
  )
}
```

- [ ] **Step 5: Pass `game!.name` from the page**

In `app/[leagueId]/results/page.tsx`, update the two render sites that use these components.

For the public tier (`PublicMatchEntrySection`):
```tsx
<PublicMatchEntrySection
  gameId={leagueId}
  weeks={weeks}
  initialScheduledWeek={nextWeek}
  leagueName={game!.name}
/>
```

For the member/admin tier (`ResultsSection`):
```tsx
<ResultsSection
  gameId={leagueId}
  weeks={weeks}
  goalkeepers={goalkeepers}
  initialScheduledWeek={nextWeek}
  canAutoPick={true}
  allPlayers={players}
  showMatchHistory={canSeeMatchHistory}
  leagueDayIndex={leagueDayIndex}
  isAdmin={isAdmin}
  leagueName={game!.name}
/>
```

- [ ] **Step 6: Confirm TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add components/NextMatchCard.tsx components/ResultsSection.tsx components/ResultsRefresher.tsx components/PublicMatchEntrySection.tsx app/[leagueId]/results/page.tsx
git commit -m "feat: thread leagueName prop through to NextMatchCard"
```

---

### Task 3: Add share button to lineup footer

**Files:**
- Modify: `components/NextMatchCard.tsx` (import `Share2` + `buildShareText`, add `copied` state, add `handleShare`, restructure lineup footer)

- [ ] **Step 1: Add imports to `NextMatchCard.tsx`**

Update the lucide-react import line (currently `import { X } from 'lucide-react'`):

```ts
import { X, Share2 } from 'lucide-react'
```

`NextMatchCard.tsx` has two import lines from `@/lib/utils`. Add `buildShareText` to the second one (the one with `getNextMatchDate`, `winProbability`, etc.):

```ts
import { getNextMatchDate, getNextWeekNumber, deriveSeason, ewptScore, winProbability, winCopy, isPastDeadline, buildShareText } from '@/lib/utils'
```

Leave the `import { cn } from '@/lib/utils'` line unchanged.

- [ ] **Step 2: Add `copied` state**

Inside `NextMatchCard`, alongside the existing `useState` declarations (after `const [cardState, setCardState] = useState<CardState>('loading')`):

```ts
const [copied, setCopied] = useState(false)
```

- [ ] **Step 3: Add `handleShare` function**

Add this inside `NextMatchCard`, after the other handler functions (e.g. after `handleCancelScheduled`):

```ts
async function handleShare() {
  if (!scheduledWeek || !leagueName) return
  const text = buildShareText({
    leagueName,
    leagueId: gameId,
    week: scheduledWeek.week,
    date: scheduledWeek.date,
    format: scheduledWeek.format ?? '',
    teamA: scheduledWeek.teamA,
    teamB: scheduledWeek.teamB,
    teamARating: scheduledWeek.team_a_rating ?? 0,
    teamBRating: scheduledWeek.team_b_rating ?? 0,
  })
  if (navigator.share && window.innerWidth < 768) {
    await navigator.share({ text })
  } else {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
}
```

- [ ] **Step 4: Replace the lineup footer JSX**

Find the current lineup footer block (the `{/* ── LINEUP footer ── */}` comment and its JSX). Replace it with:

```tsx
{/* ── LINEUP footer ── */}
{cardState === 'lineup' && scheduledWeek && scheduledWeek.teamA.length > 0 && scheduledWeek.teamB.length > 0 && (
  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700">
    {canEdit ? (
      <button
        type="button"
        onClick={handleCancelScheduled}
        className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium"
      >
        Reset
      </button>
    ) : (
      <div />
    )}
    <div className="flex items-center gap-2">
      {canEdit && (
        <>
          <button
            type="button"
            onClick={handleEditLineup}
            className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium"
          >
            Edit Lineups
          </button>
          <button
            type="button"
            onClick={() => { setError(null); setShowResultModal(true) }}
            className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold"
          >
            Result Game
          </button>
        </>
      )}
      <button
        type="button"
        onClick={handleShare}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium"
      >
        <Share2 className="w-3.5 h-3.5" />
        <span>{copied ? 'Copied!' : 'Share'}</span>
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 5: Confirm TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Run all tests**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 7: Manual smoke test**

Start the dev server: `npm run dev`

1. Open a league with a saved lineup — confirm the Share button appears in the scheduled week card footer.
2. On desktop: click Share — the button label should briefly change to "Copied!", and pasting into a text editor should show the full formatted message.
3. On mobile (or narrow browser width < 768px): click Share — the native share sheet should open.
4. Confirm the shared text matches the format: league name, week, date, format, Team A + score, Team B + score, prediction, URL.
5. Confirm Reset / Edit Lineups / Result Game buttons are unchanged for admins.

- [ ] **Step 8: Commit**

```bash
git add components/NextMatchCard.tsx
git commit -m "feat: add share button to scheduled week card lineup footer"
```
