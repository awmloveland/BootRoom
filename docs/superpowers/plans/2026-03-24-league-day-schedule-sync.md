# League Day & Schedule Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `games.day` into `NextMatchCard`'s next-match date suggestion and `StatsSidebar`'s quarterly games-remaining count, and add a confirmation modal to `LeagueDetailsForm` that lets admins move or keep an existing scheduled week when the league day changes.

**Architecture:** Pure-function utilities (`dayNameToIndex`, `nextOccurrenceAfterToday`) are added to `lib/utils.ts` and tested in isolation. Prop threading flows from `results/page.tsx` → `ResultsSection` → `NextMatchCard` and `results/page.tsx` → `StatsSidebar` → `QuarterlyTableWidget`. The Settings modal lives in `LeagueDetailsForm` and calls two new API routes.

**Tech Stack:** TypeScript, Next.js 14 App Router, Supabase, Tailwind CSS, Jest (test runner: `npm test`)

**Spec:** `docs/superpowers/specs/2026-03-24-league-day-schedule-sync-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/utils.ts` | Modify | Add `dayNameToIndex`, `nextOccurrenceAfterToday`; update `getNextMatchDate` signature |
| `lib/__tests__/utils.leagueDay.test.ts` | Create | Unit tests for the three new/updated utilities |
| `components/NextMatchCard.tsx` | Modify | Add `leagueDayIndex?: number` to Props; pass to `getNextMatchDate` |
| `components/ResultsSection.tsx` | Modify | Add `leagueDayIndex?: number` to Props; forward to `NextMatchCard` |
| `components/StatsSidebar.tsx` | Modify | Add `leagueDayIndex?: number` to `StatsSidebarProps` and `QuarterlyTableWidget`; forward to `computeQuarterlyTable` |
| `app/[leagueId]/results/page.tsx` | Modify | Derive `leagueDayIndex` from `game.day`; pass to `ResultsSection` and `StatsSidebar` |
| `app/api/league/[id]/weeks/scheduled/route.ts` | Create | GET — returns first scheduled week for the league or null |
| `app/api/league/[id]/weeks/[weekId]/route.ts` | Create | PATCH — updates `date` on a scheduled week (admin-only) |
| `components/LeagueDetailsForm.tsx` | Modify | Track initial day; check for scheduled week on save; show confirmation modal _(note: the spec's "Files changed" table lists `app/[leagueId]/settings/page.tsx` here, but the modal is implemented in the form component it renders — `LeagueDetailsForm` — which is the correct architectural home)_ |

---

## Task 1: Utilities — `dayNameToIndex`, `getNextMatchDate` update, `nextOccurrenceAfterToday`

**Files:**
- Modify: `lib/utils.ts`
- Create: `lib/__tests__/utils.leagueDay.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/utils.leagueDay.test.ts`:

```ts
import { dayNameToIndex, getNextMatchDate, nextOccurrenceAfterToday, formatWeekDate } from '@/lib/utils'
import type { Week } from '@/lib/types'

// ─── dayNameToIndex ───────────────────────────────────────────────────────────

describe('dayNameToIndex', () => {
  it('maps all seven day names to correct indices', () => {
    expect(dayNameToIndex('Sunday')).toBe(0)
    expect(dayNameToIndex('Monday')).toBe(1)
    expect(dayNameToIndex('Tuesday')).toBe(2)
    expect(dayNameToIndex('Wednesday')).toBe(3)
    expect(dayNameToIndex('Thursday')).toBe(4)
    expect(dayNameToIndex('Friday')).toBe(5)
    expect(dayNameToIndex('Saturday')).toBe(6)
  })

  it('returns null for null input', () => {
    expect(dayNameToIndex(null)).toBeNull()
  })

  it('returns null for unrecognised string', () => {
    expect(dayNameToIndex('Blursday')).toBeNull()
  })
})

// ─── getNextMatchDate with leagueDayIndex ─────────────────────────────────────

describe('getNextMatchDate — with leagueDayIndex', () => {
  function makePlayedWeek(date: string): Week {
    return { week: 1, date, status: 'played', teamA: [], teamB: [], winner: null }
  }

  it('uses leagueDayIndex (Thursday=4) to find next Thursday', () => {
    // Provide a Wednesday played week — without the param it would infer Wednesday.
    // With leagueDayIndex=4 it should return a Thursday.
    const weeks = [makePlayedWeek('07 Jan 2026')] // Wednesday
    const result = getNextMatchDate(weeks, 4)
    const d = new Date(result.split(' ').reverse().join('-').replace(/ /g, '-'))
    // Day parse: "DD MMM YYYY"
    const parts = result.split(' ')
    const date = new Date(parseInt(parts[2]), ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(parts[1]), parseInt(parts[0]))
    expect(date.getDay()).toBe(4) // Thursday
  })

  it('uses leagueDayIndex=0 (Sunday) correctly — falsy guard test', () => {
    // Sunday = 0, which is falsy — must use !== undefined guard, not truthiness check
    const weeks: Week[] = []
    const result = getNextMatchDate(weeks, 0)
    const parts = result.split(' ')
    const date = new Date(parseInt(parts[2]), ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(parts[1]), parseInt(parts[0]))
    expect(date.getDay()).toBe(0) // Sunday
  })

  it('falls back to inference when leagueDayIndex is undefined', () => {
    // Wednesday played week — should infer Wednesday
    const weeks = [makePlayedWeek('07 Jan 2026')] // Wednesday
    const result = getNextMatchDate(weeks, undefined)
    const parts = result.split(' ')
    const date = new Date(parseInt(parts[2]), ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(parts[1]), parseInt(parts[0]))
    expect(date.getDay()).toBe(3) // Wednesday
  })
})

// ─── nextOccurrenceAfterToday ─────────────────────────────────────────────────

describe('nextOccurrenceAfterToday', () => {
  it('returns a date string in DD MMM YYYY format', () => {
    const result = nextOccurrenceAfterToday(3) // Wednesday
    expect(result).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}$/)
  })

  it('returns a date whose day-of-week matches dayIndex', () => {
    for (let i = 0; i < 7; i++) {
      const result = nextOccurrenceAfterToday(i)
      const parts = result.split(' ')
      const date = new Date(parseInt(parts[2]), ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(parts[1]), parseInt(parts[0]))
      expect(date.getDay()).toBe(i)
    }
  })

  it('never returns today — always at least tomorrow', () => {
    const today = new Date()
    const todayDow = today.getDay()
    // Use today's DOW — should get next week's occurrence, not today
    const result = nextOccurrenceAfterToday(todayDow)
    const parts = result.split(' ')
    const date = new Date(parseInt(parts[2]), ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(parts[1]), parseInt(parts[0]))
    today.setHours(0, 0, 0, 0)
    expect(date.getTime()).toBeGreaterThan(today.getTime())
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/kingston
npx jest lib/__tests__/utils.leagueDay.test.ts --no-coverage
```

Expected: all tests fail with `dayNameToIndex is not a function` / `nextOccurrenceAfterToday is not a function`.

- [ ] **Step 3: Implement `dayNameToIndex` and `nextOccurrenceAfterToday` in `lib/utils.ts`**

After the existing exports (after `getNextWeekNumber`, around line 210), add:

```ts
const DAY_NAME_TO_INDEX: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
}

/** Convert a day name string (e.g. "Thursday") to a Date.getDay() index (0=Sun…6=Sat). Returns null if null or unrecognised. */
export function dayNameToIndex(day: string | null): number | null {
  if (!day) return null
  return DAY_NAME_TO_INDEX[day] ?? null
}

/**
 * Return the next calendar occurrence of `dayIndex` (0=Sun…6=Sat) after today
 * as a 'DD MMM YYYY' string. Never returns today — always at least tomorrow.
 */
export function nextOccurrenceAfterToday(dayIndex: number): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let daysUntil = (dayIndex - today.getDay() + 7) % 7
  if (daysUntil === 0) daysUntil = 7
  const next = new Date(today)
  next.setDate(today.getDate() + daysUntil)
  return formatWeekDate(next)
}
```

- [ ] **Step 4: Update `getNextMatchDate` signature**

The current function starts at line 185. Replace it:

```ts
export function getNextMatchDate(weeks: Week[], leagueDayIndex?: number): string {
  const played = getPlayedWeeks(sortWeeks(weeks))
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Use leagueDayIndex if provided (note: 0 = Sunday is valid, use !== undefined not truthiness)
  const dow = leagueDayIndex !== undefined
    ? leagueDayIndex
    : played.length > 0
      ? parseWeekDate(played[0].date).getDay()
      : null

  if (dow === null) {
    const next = new Date(today)
    next.setDate(today.getDate() + 7)
    return formatWeekDate(next)
  }

  let daysUntil = (dow - today.getDay() + 7) % 7
  if (daysUntil === 0) {
    const todayStr = formatWeekDate(today)
    if (weeks.some((w) => w.date === todayStr)) daysUntil = 7
  }
  const next = new Date(today)
  next.setDate(today.getDate() + daysUntil)
  return formatWeekDate(next)
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx jest lib/__tests__/utils.leagueDay.test.ts --no-coverage
```

Expected: all tests pass.

- [ ] **Step 6: Run the full test suite to confirm no regressions**

```bash
npm test -- --no-coverage
```

Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.leagueDay.test.ts
git commit -m "feat: add dayNameToIndex, nextOccurrenceAfterToday; thread leagueDayIndex into getNextMatchDate"
```

---

## Task 2: Component prop threading — results page → ResultsSection → NextMatchCard + StatsSidebar

> **Depends on Task 1** — `getNextMatchDate` must accept the new second argument before TypeScript will accept the call site change in `NextMatchCard`.

**Files:**
- Modify: `components/NextMatchCard.tsx` (Props interface at lines 17–32; useMemo at line 170)
- Modify: `components/ResultsSection.tsx` (Props interface at lines 10–18; NextMatchCard render at line 43)
- Modify: `components/StatsSidebar.tsx` (StatsSidebarProps at lines 8–13; QuarterlyTableWidget at line 82)
- Modify: `app/[leagueId]/results/page.tsx` (after line 188; ResultsSection render ~line 264; StatsSidebar render ~line 283)

No unit tests for prop threading — TypeScript compilation is the verification.

- [ ] **Step 1: Update `NextMatchCard` Props interface**

In `components/NextMatchCard.tsx`, add to the `Props` interface (lines 17–32):

```ts
/** Day-of-week index (0=Sun…6=Sat) from league config — used to compute next match date. */
leagueDayIndex?: number
```

Then destructure it in the function signature:
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
}: Props) {
```

Then update line 170:
```ts
const nextDate = useMemo(() => getNextMatchDate(weeks, leagueDayIndex), [weeks, leagueDayIndex])
```

Also update the import to include `dayNameToIndex` if not already there (it won't be needed here since we use the index directly).

- [ ] **Step 2: Update `ResultsSection` Props interface and forward prop**

In `components/ResultsSection.tsx`, add to the `Props` interface (lines 10–18):
```ts
leagueDayIndex?: number
```

Destructure in the function signature:
```ts
export function ResultsSection({
  gameId,
  weeks,
  goalkeepers,
  initialScheduledWeek,
  canAutoPick,
  allPlayers,
  showMatchHistory,
  leagueDayIndex,
}: Props) {
```

Then forward it to `NextMatchCard` (line ~43):
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
/>
```

- [ ] **Step 3: Update `StatsSidebar` and `QuarterlyTableWidget`**

In `components/StatsSidebar.tsx`:

Update `StatsSidebarProps` (lines 8–13):
```ts
interface StatsSidebarProps {
  players: Player[]
  weeks: Week[]
  features: LeagueFeature[]
  role: GameRole | null
  leagueDayIndex?: number
}
```

Destructure in the exported function:
```ts
export function StatsSidebar({ players, weeks, features, role, leagueDayIndex }: StatsSidebarProps) {
```

Update `QuarterlyTableWidget` signature (line 82):
```ts
function QuarterlyTableWidget({ weeks, leagueDayIndex }: { weeks: Week[]; leagueDayIndex?: number }) {
  const { quarterLabel, entries, lastChampion, lastQuarterLabel, gamesLeft } = computeQuarterlyTable(weeks, new Date(), leagueDayIndex)
```

Update the call site where `QuarterlyTableWidget` is rendered (line ~233):
```tsx
<QuarterlyTableWidget weeks={weeks} leagueDayIndex={leagueDayIndex} />
```

- [ ] **Step 4: Update the results page**

In `app/[leagueId]/results/page.tsx`, update the existing `@/lib/utils` import at line 8 to include `dayNameToIndex` (add to the existing line, do not create a second import statement):

```ts
// Before:
import { sortWeeks } from '@/lib/utils'
// After:
import { sortWeeks, dayNameToIndex } from '@/lib/utils'
```

Then, after the `details` const (around line 188), add:

```ts
const leagueDayIndex = dayNameToIndex(game.day ?? null) ?? undefined
```

Update the `ResultsSection` render (~line 264):
```tsx
<ResultsSection
  gameId={leagueId}
  weeks={weeks}
  goalkeepers={goalkeepers}
  initialScheduledWeek={nextWeek}
  canAutoPick={canSeeTeamBuilder}
  allPlayers={players}
  showMatchHistory={canSeeMatchHistory}
  leagueDayIndex={leagueDayIndex}
/>
```

Update **both** `StatsSidebar` renders — there are two: one in the public tier (~line 233) and one in the member/admin tier (~line 283). Both need the new prop:

```tsx
{/* Public tier StatsSidebar (~line 233): */}
<StatsSidebar
  players={players}
  weeks={weeks}
  features={features}
  role={userRole}
  leagueDayIndex={leagueDayIndex}
/>

{/* Member/admin tier StatsSidebar (~line 283): */}
<StatsSidebar
  players={players}
  weeks={weeks}
  features={features}
  role={userRole}
  leagueDayIndex={leagueDayIndex}
/>
```

- [ ] **Step 5: Verify TypeScript compiles cleanly**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/kingston
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/NextMatchCard.tsx components/ResultsSection.tsx components/StatsSidebar.tsx app/[leagueId]/results/page.tsx
git commit -m "feat: thread leagueDayIndex from results page into NextMatchCard and StatsSidebar"
```

---

## Task 3: API — `GET /api/league/[id]/weeks/scheduled`

**Files:**
- Create: `app/api/league/[id]/weeks/scheduled/route.ts`

- [ ] **Step 1: Create the route file**

```ts
// app/api/league/[id]/weeks/scheduled/route.ts
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

/** GET — returns the first scheduled week for the league, or null. No auth required (service role read). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('weeks')
    .select('id, week, date')
    .eq('game_id', id)
    .eq('status', 'scheduled')
    .order('week', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ week: data ?? null })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/league/[id]/weeks/scheduled/route.ts
git commit -m "feat: add GET /api/league/[id]/weeks/scheduled route"
```

---

## Task 4: API — `PATCH /api/league/[id]/weeks/[weekId]`

**Files:**
- Create: `app/api/league/[id]/weeks/[weekId]/route.ts`

- [ ] **Step 1: Create the route file**

```ts
// app/api/league/[id]/weeks/[weekId]/route.ts
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const DATE_RE = /^\d{2} [A-Z][a-z]{2} \d{4}$/

/** PATCH — admin-only, updates the date on a scheduled week. Body: { date: string } in "DD MMM YYYY" format. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; weekId: string }> }
) {
  const { id, weekId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await supabase.rpc('is_game_admin', { p_game_id: id })
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const b = body as Record<string, unknown>
  const date = typeof b.date === 'string' ? b.date.trim() : ''
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: 'date must be in "DD MMM YYYY" format' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('weeks')
    .update({ date })
    .eq('id', weekId)
    .eq('game_id', id)
    .eq('status', 'scheduled')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/league/[id]/weeks/[weekId]/route.ts
git commit -m "feat: add PATCH /api/league/[id]/weeks/[weekId] route for rescheduling"
```

---

## Task 5: `LeagueDetailsForm` — day-change confirmation modal

**Files:**
- Modify: `components/LeagueDetailsForm.tsx`

This task adds:
1. Tracking of the initial day value (to detect a change)
2. A `checkScheduledWeek` helper that calls the new GET route
3. A modal state + UI for the two-choice confirmation
4. A `handleSave` update that intercepts when day has changed and a scheduled week exists

- [ ] **Step 1: Add state and helpers to `LeagueDetailsForm`**

Replace the contents of `components/LeagueDetailsForm.tsx` with the updated version below. Read the current file first to preserve all existing UI — only new state, the updated `handleSave`, and a new modal section are added.

At the top, add the `dayNameToIndex`, `nextOccurrenceAfterToday`, and `formatWeekDate` imports:

```ts
import { dayNameToIndex, nextOccurrenceAfterToday, formatWeekDate } from '@/lib/utils'
```

Add new state variables after the existing `saved` state:

```ts
// Day-change modal
// initialDay uses a setter so it can be updated after each successful save.
// Without this, a second save in the same session would compare against the original
// mount-time value instead of the last-saved day.
const [initialDay, setInitialDay] = useState(initialDetails.day ?? '')
const [showDayChangeModal, setShowDayChangeModal] = useState(false)
const [scheduledWeekForModal, setScheduledWeekForModal] = useState<{ id: string; date: string } | null>(null)
// Pre-computed new date for the modal label — avoids non-null assertion inside JSX.
const [newDayDisplayDate, setNewDayDisplayDate] = useState<string | null>(null)
```

Add a `displayDate` helper function (pure, inside the component):

```ts
function displayDate(dateStr: string): string {
  const [d, m, y] = dateStr.split(' ')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const date = new Date(parseInt(y), months.indexOf(m), parseInt(d))
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}
```

- [ ] **Step 2: Update `handleSave` to check for day change + scheduled week**

Replace the existing `handleSave` function:

```ts
async function handleSave() {
  if (!name.trim()) {
    setError('League name is required')
    return
  }

  // If the day has changed, check for an existing scheduled week before proceeding
  if (day !== initialDay && day && initialDay) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/league/${leagueId}/weeks/scheduled`, { credentials: 'include' })
      const data = await res.json()
      if (data.week) {
        const dayIdx = dayNameToIndex(day)
        const nextDate = dayIdx !== null ? displayDate(nextOccurrenceAfterToday(dayIdx)) : null
        setScheduledWeekForModal(data.week)
        setNewDayDisplayDate(nextDate)
        setShowDayChangeModal(true)
        setSaving(false)
        return
      }
    } catch {
      // If the check fails, proceed with save anyway
    }
    setSaving(false)
  }

  await commitSave()
}

async function commitSave(rescheduleWeekId?: string) {
  setSaving(true)
  setError(null)
  try {
    const res = await fetch(`/api/league/${leagueId}/details`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        location: location || null,
        day: day || null,
        kickoff_time: kickoffTime || null,
        bio: bio || null,
      }),
    })
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to save')
      return
    }

    // If "Move this match" was chosen, update the scheduled week date
    if (rescheduleWeekId && day) {
      const dayIdx = dayNameToIndex(day)
      if (dayIdx !== null) {
        const newDate = nextOccurrenceAfterToday(dayIdx)
        await fetch(`/api/league/${leagueId}/weeks/${rescheduleWeekId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ date: newDate }),
        })
      }
    }

    setSaved(true)
    setInitialDay(day) // update so a second save in the same session compares against the new day
    onNameSaved(name.trim())
  } catch {
    setError('Network error')
  } finally {
    setSaving(false)
    setShowDayChangeModal(false)
    setScheduledWeekForModal(null)
  }
}
```

- [ ] **Step 3: Add the modal UI**

In the `return` block, add the modal just before the closing `</div>` of the outer wrapper. Use Radix Dialog (already imported in other components via `@radix-ui/react-dialog`) — but since `LeagueDetailsForm` is a simpler component that doesn't currently use Dialog, implement it with a plain conditional overlay to keep this change contained:

```tsx
{/* Day-change confirmation modal */}
{showDayChangeModal && scheduledWeekForModal && day && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
    <div className="w-full max-w-sm mx-4 rounded-lg bg-slate-800 border border-slate-700 shadow-xl">
      <div className="px-5 pt-5 pb-4">
        <p className="text-sm font-medium text-slate-100 mb-1">Change match day?</p>
        <p className="text-xs text-slate-400 mb-4">
          You&apos;ve changed the match day from <span className="text-slate-200">{initialDay}</span> to <span className="text-slate-200">{day}</span>.
          You have a match scheduled for <span className="text-slate-200">{displayDate(scheduledWeekForModal.date)}</span>.
        </p>
        <div className="space-y-2">
          <button
            onClick={() => commitSave(scheduledWeekForModal.id)}
            disabled={saving}
            className="w-full rounded-md px-4 py-2.5 text-sm font-medium bg-slate-100 text-slate-900 hover:bg-white disabled:opacity-50 transition-colors text-left"
          >
            <span className="block font-semibold">Move this match</span>
            <span className="block text-xs text-slate-600 mt-0.5">
              {newDayDisplayDate ? `Reschedule to ${newDayDisplayDate}` : `Reschedule to next ${day}`}
            </span>
          </button>
          <button
            onClick={() => commitSave()}
            disabled={saving}
            className="w-full rounded-md px-4 py-2.5 text-sm font-medium bg-slate-700 text-slate-200 hover:bg-slate-600 disabled:opacity-50 transition-colors text-left"
          >
            <span className="block font-semibold">Keep this match</span>
            <span className="block text-xs text-slate-500 mt-0.5">
              Leave {displayDate(scheduledWeekForModal.date)} as-is, apply {day} from next game
            </span>
          </button>
        </div>
      </div>
      <div className="border-t border-slate-700 px-5 py-3">
        <button
          onClick={() => { setShowDayChangeModal(false); setScheduledWeekForModal(null) }}
          disabled={saving}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run full test suite**

```bash
npm test -- --no-coverage
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/LeagueDetailsForm.tsx
git commit -m "feat: add day-change confirmation modal to LeagueDetailsForm"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run the full test suite one final time**

```bash
npm test -- --no-coverage
```

Expected: all tests pass.

- [ ] **Step 2: TypeScript clean check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test checklist**

In the running dev server (`npm run dev`):

1. Go to a league Results page → check "X games left" badge in sidebar reflects the league's configured day
2. Open NextMatchCard (no lineup built yet) → check suggested date is on the configured day
3. Go to Settings → League Details → change the day to a different value → click Save
   - **No scheduled week case:** Save proceeds immediately, no modal
   - **Scheduled week case:** Modal appears with both options; test "Move this match" → check the week is rescheduled; test "Keep this match" → check the week date is unchanged but `games.day` is updated
4. Reload Results page → confirm sidebar and NextMatchCard both reflect the new day

- [ ] **Step 4: Commit if any final tweaks were made**

```bash
git add -p
git commit -m "fix: final tweaks from smoke test"
```
