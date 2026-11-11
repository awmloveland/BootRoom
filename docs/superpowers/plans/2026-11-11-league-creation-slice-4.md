# League creation, slice 4: past results import — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After Strength, the admin enters past games in a modal built from the Edit Week pieces, imports them in one call, and lands on Live with the first line-ups seeded.

**Architecture:** `ResultsScreen` (server) loads the league and roster and renders `ResultsStep` (client), which holds draft games and opens `ImportGameModal`. `POST /api/league/[id]/weeks/import` calls the new `import_weeks` RPC. Fees and unrecorded weeks use `games.created_at` as the cut-off.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, Supabase plpgsql, Jest (+ jsdom for component tests).

**Spec:** `docs/superpowers/specs/2026-11-11-league-creation-slice-4-design.md`. **Branch:** `awmloveland/league-creation-results`, stacked on `awmloveland/league-creation-account` (PR #196). **Deploy:** run the Task 1 migration by hand before this deploys.

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/20261111000002_import_weeks.sql` | `import_weeks` RPC |
| `lib/fetchers.ts`, `lib/__tests__/fetchers.test.ts` | created-at rule in `ensureUnrecordedWeek`; `created_at` in `GAME_COLUMNS` |
| `app/[slug]/(tabs)/results/page.tsx`, `app/[slug]/(tabs)/overview/page.tsx` | pass `game.created_at` |
| `lib/fees.ts`, `lib/__tests__/fees.weeksSinceCreation.test.ts`, `app/[slug]/(tabs)/admin/page.tsx` | fee cut-off |
| `components/EditWeekModal.tsx` | export `LineupEditor` and `ResultPicker` |
| `app/api/league/[id]/weeks/import/route.ts`, `__tests__/import-route.test.ts` | import route |
| `components/new-league/ResultsScreen.tsx`, `ResultsStep.tsx`, `ImportGameModal.tsx`, `confidence.ts` | the step |
| `__tests__/results-step.test.tsx` | confidence and date helpers |
| `components/new-league/StepShell.tsx`, `StrengthStep.tsx`, `RosterWizard.tsx`, `LiveScreen.tsx`, `app/new/[[...step]]/page.tsx` | wiring |

---

### Task 1: `import_weeks` migration

**Files:** Create `supabase/migrations/20261111000002_import_weeks.sql`

- [ ] **Step 1: Write it**

```sql
-- supabase/migrations/20261111000002_import_weeks.sql
--
-- Past results entered during league setup, written in one call. Validates
-- each game, inserts played weeks, adds roster rows for new names, then
-- renumbers every week of the league by date within its season.
-- p_weeks: [{ date: 'DD Mon YYYY', team_a: [..], team_b: [..],
--             winner: 'teamA'|'teamB'|'draw', goal_difference: int }]

CREATE OR REPLACE FUNCTION public.import_weeks(p_game_id uuid, p_weeks jsonb)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w        jsonb;
  d        date;
  a        int;
  b        int;
  winner   text;
  margin   int;
  inserted int := 0;
BEGIN
  IF NOT is_game_admin(p_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF jsonb_typeof(p_weeks) <> 'array' OR jsonb_array_length(p_weeks) = 0 THEN
    RAISE EXCEPTION 'invalid_weeks';
  END IF;

  FOR w IN SELECT * FROM jsonb_array_elements(p_weeks) LOOP
    BEGIN
      d := to_date(w->>'date', 'DD Mon YYYY');
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'invalid_date';
    END;
    IF d IS NULL OR d > current_date OR to_char(d, 'DD Mon YYYY') <> (w->>'date') THEN
      RAISE EXCEPTION 'invalid_date';
    END IF;

    a := coalesce(jsonb_array_length(w->'team_a'), 0);
    b := coalesce(jsonb_array_length(w->'team_b'), 0);
    IF a = 0 OR b = 0 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(w->'team_a') x
      JOIN jsonb_array_elements_text(w->'team_b') y ON x = y
    ) THEN
      RAISE EXCEPTION 'invalid_teams';
    END IF;

    winner := w->>'winner';
    IF winner IS NULL OR winner NOT IN ('teamA', 'teamB', 'draw') THEN
      RAISE EXCEPTION 'invalid_winner';
    END IF;
    margin := (w->>'goal_difference')::int;
    IF margin IS NULL
       OR (winner = 'draw' AND margin <> 0)
       OR (winner <> 'draw' AND (margin < 1 OR margin > 20)) THEN
      RAISE EXCEPTION 'invalid_margin';
    END IF;

    IF EXISTS (SELECT 1 FROM weeks WHERE game_id = p_game_id AND date = (w->>'date')) THEN
      RAISE EXCEPTION 'already_exists';
    END IF;

    INSERT INTO weeks (game_id, season, week, date, status, format, team_a, team_b, winner, goal_difference)
    VALUES (
      p_game_id,
      to_char(d, 'YYYY'),
      -- Placeholder; renumbered below. Offset so it cannot collide meanwhile.
      100000 + inserted,
      w->>'date',
      'played',
      CASE WHEN a = b THEN a || '-a-side' ELSE greatest(a, b) || 'v' || least(a, b) END,
      w->'team_a',
      w->'team_b',
      winner,
      margin
    );
    inserted := inserted + 1;

    INSERT INTO player_attributes (game_id, name, rating, mentality, goalkeeper)
    SELECT DISTINCT p_game_id, n, 2, 'balanced', false
    FROM (
      SELECT jsonb_array_elements_text(w->'team_a') AS n
      UNION
      SELECT jsonb_array_elements_text(w->'team_b')
    ) names
    ON CONFLICT (game_id, name) DO NOTHING;
  END LOOP;

  -- Renumber 1..n per season by date. Two passes so (game_id, season, week)
  -- stays unique while rows move.
  UPDATE weeks SET week = week + 100000 WHERE game_id = p_game_id AND week < 100000;
  UPDATE weeks x
     SET week = r.rn
    FROM (
      SELECT id, row_number() OVER (PARTITION BY season ORDER BY to_date(date, 'DD Mon YYYY'), created_at) AS rn
      FROM weeks WHERE game_id = p_game_id
    ) r
   WHERE x.id = r.id;

  RETURN inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_weeks(uuid, jsonb) TO authenticated;
```

- [ ] **Step 2: Read it against the schema.** `weeks` columns used exist (`game_id, season, week, date, status, format, team_a, team_b, winner, goal_difference, created_at`); `weeks.status` allows `'played'`; the unique constraint is `(game_id, season, week)` (migration 20260417000001); `is_game_admin(uuid)` exists; `player_attributes` PK is `(game_id, name)`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261111000002_import_weeks.sql
git commit -m "Add import_weeks for past results entered during league setup

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Unrecorded weeks respect the league's creation date

**Files:** `lib/fetchers.ts`, `lib/__tests__/fetchers.test.ts`, `app/[slug]/(tabs)/results/page.tsx`, `app/[slug]/(tabs)/overview/page.tsx`

- [ ] **Step 1: Tests.** In `lib/__tests__/fetchers.test.ts`, inside `describe('ensureUnrecordedWeek')`, replace the case `'does nothing for a league with no weeks yet'` with:

```ts
  it('does nothing for a game day before the league was created', async () => {
    // Created Friday 10 Apr 2026 at 09:00 London; Thursday 9 Apr is before that day.
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 10, 12))
    const rpc = jest.fn()
    ;(createServiceClient as jest.Mock).mockReturnValue({ rpc })
    const weeks: Week[] = []

    await expect(ensureUnrecordedWeek(LEAGUE, weeks, 4, '2026-04-10T08:00:00.000Z')).resolves.toBe(weeks)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('creates the row for a game day on or after the creation day', async () => {
    // Created Thursday 9 Apr 2026 in the morning; that evening's game passed with no row.
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 10, 12))
    const rpc = jest.fn().mockResolvedValue({ data: 'new-id', error: null })
    ;(createServiceClient as jest.Mock).mockReturnValue({ rpc })

    const result = await ensureUnrecordedWeek(LEAGUE, [], 4, '2026-04-09T08:00:00.000Z')
    expect(rpc).toHaveBeenCalledWith('create_unrecorded_week', expect.objectContaining({ p_date: '09 Apr 2026', p_week: 1 }))
    expect(result).toHaveLength(1)
  })
```

- [ ] **Step 2: Run to confirm they fail** (`npm test -- lib/__tests__/fetchers.test.ts -t "creation"`): the first passes by accident (empty guard), the second FAILS because the empty guard returns early.

- [ ] **Step 3: Implement.** In `lib/fetchers.ts`:
  - `GAME_COLUMNS` becomes `'id, name, slug, location, day, kickoff_time, bio, created_at'`.
  - `ensureUnrecordedWeek` signature: `(leagueId: string, weeks: Week[], leagueDayIndex?: number, createdAt?: string | null)`. Replace the empty-list guard with, after `const recentDate = …`:
    ```ts
      if (!recentDate || !isPastDeadline(recentDate)) return weeks
      // Game days before the league existed are history, imported or not, never missed games.
      if (createdAt && parseWeekDate(recentDate) < startOfLeagueDay(createdAt)) return weeks
    ```
    where `startOfLeagueDay` is a tiny helper in `lib/dates.ts`:
    ```ts
    /** Midnight, league time, of the day an ISO timestamp falls on. */
    export function startOfLeagueDay(iso: string): Date {
      const d = leagueNow(new Date(iso))
      d.setHours(0, 0, 0, 0)
      return d
    }
    ```
    (`leagueNow(at)` already converts an instant to the league's clock; check its signature in `lib/dates.ts:59`.) Import it into fetchers. Update the function's doc comment with one line about the rule.
  - Both pages: change the call to `ensureUnrecordedWeek(leagueId, rawWeeks, leagueDayIndex, game.created_at)`.

- [ ] **Step 4:** `npm test -- lib/__tests__/fetchers.test.ts` (all pass) and `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add lib/fetchers.ts lib/dates.ts lib/__tests__/fetchers.test.ts "app/[slug]/(tabs)/results/page.tsx" "app/[slug]/(tabs)/overview/page.tsx"
git commit -m "Never create an unrecorded week for a game day before the league existed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Fees cut off at creation

**Files:** `lib/fees.ts`, `lib/__tests__/fees.weeksSinceCreation.test.ts`, `app/[slug]/(tabs)/admin/page.tsx`

- [ ] **Step 1: Test**

```ts
// lib/__tests__/fees.weeksSinceCreation.test.ts
import { weeksSinceCreation } from '@/lib/fees'
import type { Week } from '@/lib/types'

const week = (date: string): Week => ({ season: date.slice(-4), week: 1, date, status: 'played', teamA: [], teamB: [], winner: 'teamA' })

it('drops weeks dated before the day the league was created', () => {
  const weeks = [week('02 Apr 2026'), week('09 Apr 2026'), week('16 Apr 2026')]
  expect(weeksSinceCreation(weeks, '2026-04-09T18:30:00.000Z').map((w) => w.date)).toEqual(['09 Apr 2026', '16 Apr 2026'])
})

it('keeps everything when there is no creation date', () => {
  const weeks = [week('02 Apr 2026')]
  expect(weeksSinceCreation(weeks, null)).toBe(weeks)
})
```

- [ ] **Step 2:** Run it (fails: not exported).

- [ ] **Step 3: Implement** in `lib/fees.ts` (import `startOfLeagueDay` from `@/lib/dates`):

```ts
/** Weeks on or after the day the league was created. Imported history is not fee debt. */
export function weeksSinceCreation(weeks: Week[], createdAt: string | null | undefined): Week[] {
  if (!createdAt) return weeks
  const start = startOfLeagueDay(createdAt)
  return weeks.filter((w) => parseWeekDate(w.date) >= start)
}
```

In `app/[slug]/(tabs)/admin/page.tsx` change the `weeks=` prop to `weeks={weeksSinceCreation(weeks, game.created_at).filter((w) => isChargeable(w.status) || w.status === 'cancelled')}` and add the import.

- [ ] **Step 4:** `npm test -- lib/__tests__/fees.weeksSinceCreation.test.ts __tests__/admin-page.test.tsx && npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add lib/fees.ts lib/__tests__/fees.weeksSinceCreation.test.ts "app/[slug]/(tabs)/admin/page.tsx"
git commit -m "Leave weeks before the league's creation out of the fee books

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Export the line-up editor and result picker

**Files:** `components/EditWeekModal.tsx`

- [ ] **Step 1:** Make `LineupEditor` exported and widen its roster prop: `export function LineupEditor({ … allPlayers … }: { …; allPlayers: { name: string }[]; … })`. Remove the now-unused `Player` import if nothing else in the file uses it (the modal's own props still use `Player`, so keep it).

- [ ] **Step 2:** Extract the Result and Margin blocks (the two `<div>`s under `{status === 'played' && (<>` up to and including the margin `</div>`) into

```tsx
/** Team A / Draw / Team B with the margin stepper. Shared with the league setup import modal. */
export function ResultPicker({
  winner,
  margin,
  onWinner,
  onMargin,
}: {
  winner: Winner
  margin: number
  onWinner: (w: Winner) => void
  onMargin: (m: number) => void
}) {
  return (
    <>
      {/* the existing Result block, with setWinner(opt) → onWinner(opt) */}
      {/* the existing Margin block, with setMargin((m) => …) → onMargin(Math.max(1, margin - 1)) / onMargin(Math.min(20, margin + 1)) */}
    </>
  )
}
```

and render `<ResultPicker winner={winner} margin={margin} onWinner={setWinner} onMargin={setMargin} />` in its place. Keep the JSX otherwise byte-identical.

- [ ] **Step 3:** `npm test -- __tests__/edit-week-modal-tap-to-move.test.tsx __tests__/margin-of-victory.test.ts && npx tsc --noEmit && npx eslint components/EditWeekModal.tsx`.

- [ ] **Step 4: Commit**

```bash
git add components/EditWeekModal.tsx
git commit -m "Export the line-up editor and result picker from the Edit Week modal

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Import route

**Files:** `app/api/league/[id]/weeks/import/route.ts`, `__tests__/import-route.test.ts`

- [ ] **Step 1: Test**

```ts
// __tests__/import-route.test.ts
import { createClient } from '@/lib/supabase/server'
import { mockAuthNamespace } from '@/lib/__tests__/helpers/supabase-auth'
import { revalidateTag } from 'next/cache'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }))

import { POST } from '@/app/api/league/[id]/weeks/import/route'

const LEAGUE = 'g1'
const USER = { id: 'u1', email: 'a@example.com' }
const rpc = jest.fn()

function setup(user: typeof USER | null, isAdmin = true, result: { data: unknown; error: { message: string } | null } = { data: 2, error: null }) {
  rpc.mockImplementation((name: string) => Promise.resolve(name === 'is_game_admin' ? { data: isAdmin, error: null } : result))
  ;(createClient as jest.Mock).mockResolvedValue({ auth: mockAuthNamespace(user), rpc })
}

function post(body: unknown) {
  return POST(new Request('http://localhost/api', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: LEAGUE }) })
}

const GAME = { date: '08 Oct 2026', teamA: ['Alice', 'Bob'], teamB: ['Carl', 'Dan'], winner: 'teamA', goalDifference: 2 }
const DRAW = { ...GAME, date: '01 Oct 2026', winner: 'draw', goalDifference: 0 }

beforeEach(() => jest.resetAllMocks())

describe('POST /api/league/[id]/weeks/import', () => {
  it('returns 401 signed out', async () => {
    setup(null)
    expect((await post({ games: [GAME] })).status).toBe(401)
  })

  it('returns 403 for a non-admin', async () => {
    setup(USER, false)
    expect((await post({ games: [GAME] })).status).toBe(403)
  })

  it.each([
    ['no list', {}],
    ['an empty list', { games: [] }],
    ['a bad date', { games: [{ ...GAME, date: '2026-10-08' }] }],
    ['an empty side', { games: [{ ...GAME, teamB: [] }] }],
    ['a blank name', { games: [{ ...GAME, teamA: ['Alice', ' '] }] }],
    ['an unknown winner', { games: [{ ...GAME, winner: 'A' }] }],
    ['a fractional margin', { games: [{ ...GAME, goalDifference: 1.5 }] }],
  ])('returns 400 for %s', async (_label, body) => {
    setup(USER)
    expect((await post(body)).status).toBe(400)
    expect(rpc).not.toHaveBeenCalledWith('import_weeks', expect.anything())
  })

  it('imports the batch in one RPC call and revalidates', async () => {
    setup(USER)
    const res = await post({ games: [GAME, DRAW] })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, count: 2 })
    expect(rpc).toHaveBeenCalledWith('import_weeks', {
      p_game_id: LEAGUE,
      p_weeks: [
        { date: '08 Oct 2026', team_a: ['Alice', 'Bob'], team_b: ['Carl', 'Dan'], winner: 'teamA', goal_difference: 2 },
        { date: '01 Oct 2026', team_a: ['Alice', 'Bob'], team_b: ['Carl', 'Dan'], winner: 'draw', goal_difference: 0 },
      ],
    })
    expect(revalidateTag).toHaveBeenCalledWith('league:g1', expect.anything())
  })

  it('maps already_exists to 409 and invalid_* to 400', async () => {
    setup(USER, true, { data: null, error: { message: 'already_exists' } })
    expect((await post({ games: [GAME] })).status).toBe(409)
    setup(USER, true, { data: null, error: { message: 'invalid_margin' } })
    expect((await post({ games: [GAME] })).status).toBe(400)
  })
})
```

- [ ] **Step 2:** Run it (module not found).

- [ ] **Step 3: Route**

```ts
// app/api/league/[id]/weeks/import/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin, rpcErrorStatus } from '@/lib/apiAuth'
import { revalidateLeague } from '@/lib/leagueCache'
import type { Winner } from '@/lib/types'

const MAX_GAMES = 200
const WEEK_DATE = /^\d{2} [A-Z][a-z]{2} \d{4}$/
const WINNERS: Exclude<Winner, null>[] = ['teamA', 'teamB', 'draw']

interface ImportGame {
  date: string
  teamA: string[]
  teamB: string[]
  winner: Exclude<Winner, null>
  goalDifference: number
}

const isNames = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every((n) => typeof n === 'string' && n.trim() !== '')

function parseGame(v: unknown): ImportGame | null {
  const g = v as Record<string, unknown>
  if (!g || typeof g !== 'object') return null
  if (typeof g.date !== 'string' || !WEEK_DATE.test(g.date)) return null
  if (!isNames(g.teamA) || !isNames(g.teamB)) return null
  if (!WINNERS.includes(g.winner as Exclude<Winner, null>)) return null
  if (!Number.isInteger(g.goalDifference)) return null
  return { date: g.date, teamA: g.teamA, teamB: g.teamB, winner: g.winner as Exclude<Winner, null>, goalDifference: g.goalDifference as number }
}

/**
 * POST — admin only. Writes past results entered during league setup through
 * import_weeks, which validates dates, sides, winners and margins again,
 * renumbers the league's weeks and adds roster rows for new names.
 * Body: { games: [{ date: 'DD MMM YYYY', teamA, teamB, winner, goalDifference }] }.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireLeagueAdmin(id)
  if ('response' in gate) return gate.response

  const body = (await req.json().catch(() => null)) as { games?: unknown } | null
  const raw = Array.isArray(body?.games) ? body.games : null
  if (!raw || raw.length === 0 || raw.length > MAX_GAMES) {
    return NextResponse.json({ error: `Send between 1 and ${MAX_GAMES} games` }, { status: 400 })
  }
  const games = raw.map(parseGame)
  if (games.some((g) => g === null)) return NextResponse.json({ error: 'Invalid game' }, { status: 400 })

  const supabase = await createClient()
  const { data: count, error } = await supabase.rpc('import_weeks', {
    p_game_id: id,
    p_weeks: (games as ImportGame[]).map((g) => ({
      date: g.date,
      team_a: g.teamA,
      team_b: g.teamB,
      winner: g.winner,
      goal_difference: g.goalDifference,
    })),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: rpcErrorStatus(error.message) })

  revalidateLeague(id)
  return NextResponse.json({ ok: true, count })
}
```

- [ ] **Step 4:** `npm test -- __tests__/import-route.test.ts` (12 tests) and `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add "app/api/league/[id]/weeks/import" __tests__/import-route.test.ts
git commit -m "Add POST /api/league/[id]/weeks/import

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The Results step

**Files:**
- Create: `components/new-league/confidence.ts`, `components/new-league/ImportGameModal.tsx`, `components/new-league/ResultsStep.tsx`, `components/new-league/ResultsScreen.tsx`, `__tests__/results-step.test.tsx`
- Modify: `components/new-league/StepShell.tsx` (`STEP_COUNT = 7`), `components/new-league/RosterWizard.tsx` (after save, `router.push(\`/new/${slug}/results\`)`), `components/new-league/LiveScreen.tsx`, `app/new/[[...step]]/page.tsx`

- [ ] **Step 1: Pure helpers and their test**

```ts
// components/new-league/confidence.ts
// Copy and numbers for the Lineup confidence card, and the draft-date rules
// for the import modal. Pure, so the step can be tested without a browser.
import { formatWeekDate, parseWeekDate } from '@/lib/dates'

export type Tone = 'muted' | 'sky' | 'lime'

export function lineupConfidence(games: number): { percent: number; line: string; tone: Tone } {
  const percent = Math.min(100, games * 10)
  const tone: Tone = games >= 10 ? 'lime' : games >= 5 ? 'sky' : 'muted'
  const line =
    games === 0 ? 'Optional. Every past result makes your first lineups fairer.'
    : games <= 2 ? 'Every game you add makes your first lineups fairer.'
    : games <= 5 ? 'Good start. More games, fairer lineups.'
    : games <= 9 ? 'Plenty to start with. Add more if you have them.'
    : 'Full confidence. Lineups run on real results.'
  return { percent, line, tone }
}

/** 'DD MMM YYYY' moved by whole weeks. */
export function shiftWeeks(date: string, weeks: number): string {
  const d = parseWeekDate(date)
  d.setDate(d.getDate() + 7 * weeks)
  return formatWeekDate(d)
}

/** Where a new draft starts: a week before the oldest saved game, else the latest match day. */
export function nextDraftDate(savedDates: string[], latestMatchDay: string): string {
  if (savedDates.length === 0) return latestMatchDay
  const oldest = savedDates.map(parseWeekDate).sort((a, b) => a.getTime() - b.getTime())[0]
  return shiftWeeks(formatWeekDate(oldest), -1)
}

/** 'n-a-side' for equal sides, else 'bigger v smaller', matching import_weeks. */
export function sidesFormat(a: number, b: number): string {
  return a === b ? `${a}-a-side` : `${Math.max(a, b)}v${Math.min(a, b)}`
}
```

```tsx
// __tests__/results-step.test.tsx
import { lineupConfidence, nextDraftDate, shiftWeeks, sidesFormat } from '@/components/new-league/confidence'

describe('lineupConfidence', () => {
  it.each([
    [0, 0, 'muted', 'Optional. Every past result makes your first lineups fairer.'],
    [2, 20, 'muted', 'Every game you add makes your first lineups fairer.'],
    [5, 50, 'sky', 'Good start. More games, fairer lineups.'],
    [9, 90, 'sky', 'Plenty to start with. Add more if you have them.'],
    [12, 100, 'lime', 'Full confidence. Lineups run on real results.'],
  ])('%i games → %i%% %s', (games, percent, tone, line) => {
    expect(lineupConfidence(games)).toEqual({ percent, tone, line })
  })
})

describe('draft dates', () => {
  it('steps whole weeks across a month end', () => {
    expect(shiftWeeks('01 Oct 2026', -1)).toBe('24 Sep 2026')
    expect(shiftWeeks('24 Sep 2026', 1)).toBe('01 Oct 2026')
  })
  it('starts a fresh draft a week before the oldest saved game', () => {
    expect(nextDraftDate(['08 Oct 2026', '01 Oct 2026'], '15 Oct 2026')).toBe('24 Sep 2026')
  })
  it('starts at the latest match day when nothing is saved', () => {
    expect(nextDraftDate([], '15 Oct 2026')).toBe('15 Oct 2026')
  })
})

it('names the format from the sides', () => {
  expect(sidesFormat(5, 5)).toBe('5-a-side')
  expect(sidesFormat(3, 4)).toBe('4v3')
})
```

Run `npm test -- __tests__/results-step.test.tsx`: FAIL (module missing), then create `confidence.ts` and it PASSES (9 tests).

- [ ] **Step 2: ImportGameModal**

```tsx
// components/new-league/ImportGameModal.tsx
'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { PlayerAttribute, Winner } from '@/lib/types'
import { cn } from '@/lib/utils'
import { formatLongFixtureDate, parseWeekDate } from '@/lib/dates'
import { LineupEditor, ResultPicker } from '@/components/EditWeekModal'
import { AddRosterPlayerModal } from '@/components/AddRosterPlayerModal'
import { shiftWeeks } from './confidence'

export interface DraftGame {
  id: string
  /** 'DD MMM YYYY' */
  date: string
  teamA: string[]
  teamB: string[]
  winner: Winner
  goalDifference: number
}

interface Props {
  leagueId: string
  /** "Game 3" in the header. */
  number: number
  draft: DraftGame
  /** True when the draft is already in the saved list. */
  editing: boolean
  roster: string[]
  /** The most recent match day on or before today; the stepper cannot pass it. */
  latestMatchDay: string
  /** Dates taken by other saved games. */
  takenDates: string[]
  onRosterAdd: (name: string) => void
  onSave: (game: DraftGame) => void
  onDelete: () => void
  onClose: () => void
}

const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function ImportGameModal({ leagueId, number, draft, editing, roster, latestMatchDay, takenDates, onRosterAdd, onSave, onDelete, onClose }: Props) {
  const [date, setDate] = useState(draft.date)
  const [teamA, setTeamA] = useState(draft.teamA)
  const [teamB, setTeamB] = useState(draft.teamB)
  const [winner, setWinner] = useState<Winner>(draft.winner)
  const [margin, setMargin] = useState(draft.goalDifference > 0 ? draft.goalDifference : 1)
  const [adding, setAdding] = useState(false)

  const canGoForward = parseWeekDate(date) < parseWeekDate(latestMatchDay)
  const dateTaken = takenDates.includes(date)
  const blocker = teamA.length === 0 || teamB.length === 0 ? 'Pick both teams to save' : !winner ? 'Pick a result to save' : dateTaken ? 'You already have a game on that date' : null

  function save() {
    if (blocker) return
    onSave({ ...draft, date, teamA, teamB, winner, goalDifference: winner === 'draw' ? 0 : margin })
  }

  function addPlayer(p: PlayerAttribute) {
    onRosterAdd(p.name)
    if (teamA.length <= teamB.length) setTeamA([...teamA, p.name])
    else setTeamB([...teamB, p.name])
  }

  const label = 'block font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8] mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#030710]/80" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-[440px] flex-col overflow-hidden rounded-[14px] border border-[#1b2c46] bg-[#0a1421] shadow-[0_34px_80px_rgba(0,0,0,.65)]">
        <div className="flex items-center justify-between border-b border-[#1b2c46] bg-[#0c1728] px-5 pb-3.5 pt-4">
          <h2 className="text-[15px] font-bold tracking-[-.02em] text-[#f4f9ff]">Game {number}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-7 items-center justify-center text-[#8ba4c4] transition-colors hover:text-white">
            <X className="size-4" strokeWidth={2.2} />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-[18px]">
          <div>
            <span className={label}>Date</span>
            <div role="group" aria-label="Date" className="grid h-11 grid-cols-[44px_1fr_44px] items-center overflow-hidden rounded border border-[#1b2c46] bg-[#060b14]">
              <button type="button" aria-label="A week earlier" onClick={() => setDate(shiftWeeks(date, -1))} className="flex h-full items-center justify-center text-[#8ba4c4] hover:text-white">
                <ChevronLeft className="size-4" />
              </button>
              <div className="text-center">
                <p className="font-plex text-[13px] font-bold text-[#f4f9ff]">{formatLongFixtureDate(date).replace(/^\S+ /, '')} {date.slice(-4)}</p>
                <p className="font-plex text-[8.5px] uppercase tracking-[.14em] text-[#4f688a]">{DAY_LONG[parseWeekDate(date).getDay()]}</p>
              </div>
              <button type="button" aria-label="A week later" disabled={!canGoForward} onClick={() => setDate(shiftWeeks(date, 1))} className="flex h-full items-center justify-center text-[#8ba4c4] hover:text-white disabled:opacity-30">
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>

          <div>
            <span className={label}>Lineups</span>
            <LineupEditor teamA={teamA} teamB={teamB} allPlayers={roster.map((name) => ({ name }))} onChangeTeamA={setTeamA} onChangeTeamB={setTeamB} />
            <button type="button" onClick={() => setAdding(true)} className="mt-2 h-[30px] rounded border border-dashed border-[#223a5c] px-2.5 font-inter-body text-xs font-semibold text-[#8ba4c4] transition-colors hover:border-[#38bdf8] hover:text-[#f4f9ff]">
              + Add player
            </button>
          </div>

          <ResultPicker winner={winner} margin={margin} onWinner={setWinner} onMargin={setMargin} />
        </div>

        <div className={cn('grid gap-2 border-t border-[#1b2c46] bg-[#0c1728] px-5 py-3.5', editing ? 'grid-cols-2' : 'grid-cols-1')}>
          {editing && (
            <button type="button" onClick={onDelete} className="h-11 rounded-md border border-[#e2686f]/40 text-[13px] font-bold text-[#e2686f] transition-colors hover:bg-[#e2686f]/10">
              Delete game
            </button>
          )}
          <button type="button" onClick={save} disabled={!!blocker} className="h-11 rounded-md border border-[#38bdf8] bg-[#38bdf8]/12 text-[13px] font-bold text-[#7dd3fc] transition-colors hover:bg-[#38bdf8]/20 disabled:opacity-50">
            {blocker ?? (editing ? 'Save changes' : 'Save game')}
          </button>
        </div>
      </div>

      {adding && (
        <AddRosterPlayerModal leagueId={leagueId} existingNames={roster} onCreated={addPlayer} onClose={() => setAdding(false)} />
      )}
    </div>
  )
}
```

Check `AddRosterPlayerModal`'s `onCreated` type (`PlayerAttribute`) and `formatLongFixtureDate` ("Thursday 8 Oct") before relying on the string juggling above: the date line should read `8 Oct 2026`. If simpler, build it as `${parseInt(date, 10)} ${date.slice(3)}`; use whichever reads plainly, and keep the weekday on the second line.

- [ ] **Step 3: ResultsStep**

```tsx
// components/new-league/ResultsStep.tsx
'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { parseWeekDate } from '@/lib/dates'
import { ResultChip } from '@/components/WinnerBadge'
import { PRIMARY_BUTTON, SECONDARY_LINK, StepEyebrow, StepShell } from './StepShell'
import { ImportGameModal, type DraftGame } from './ImportGameModal'
import { lineupConfidence, nextDraftDate, sidesFormat } from './confidence'

interface Props {
  leagueId: string
  slug: string
  roster: string[]
  latestMatchDay: string
  stepOffset: number
}

const TONES = { muted: 'text-[#8ba4c4] bg-[#8ba4c4]/12 border-[#8ba4c4]/40', sky: 'text-[#38bdf8] bg-[#38bdf8]/12 border-[#38bdf8]/40', lime: 'text-[#bef264] bg-[#bef264]/12 border-[#bef264]/40' }
const FILLS = { muted: 'bg-[#8ba4c4]', sky: 'bg-[#38bdf8]', lime: 'bg-[#bef264]' }
const TICKS: [number, string][] = [[0, '0'], [3, '3 · useful'], [6, '6 · good'], [10, '10 · full']]

export function ResultsStep({ leagueId, slug, roster: initialRoster, latestMatchDay, stepOffset }: Props) {
  const router = useRouter()
  const [roster, setRoster] = useState(initialRoster)
  const [games, setGames] = useState<DraftGame[]>([])
  const [open, setOpen] = useState<{ draft: DraftGame; editing: boolean } | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sorted = [...games].sort((a, b) => parseWeekDate(b.date).getTime() - parseWeekDate(a.date).getTime())
  const { percent, line, tone } = lineupConfidence(games.length)

  function newDraft() {
    const oldest = sorted[sorted.length - 1]
    setOpen({
      editing: false,
      draft: { id: crypto.randomUUID(), date: nextDraftDate(games.map((g) => g.date), latestMatchDay), teamA: oldest?.teamA ?? [], teamB: oldest?.teamB ?? [], winner: null, goalDifference: 0 },
    })
  }

  function saveDraft(game: DraftGame) {
    setGames((gs) => (gs.some((g) => g.id === game.id) ? gs.map((g) => (g.id === game.id ? game : g)) : [...gs, game]))
    setOpen(null)
  }

  async function importAll() {
    setImporting(true)
    setError(null)
    let res: Response
    try {
      res = await fetch(`/api/league/${leagueId}/weeks/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ games: games.map(({ date, teamA, teamB, winner, goalDifference }) => ({ date, teamA, teamB, winner, goalDifference })) }),
      })
    } catch {
      setError('Could not import the games. Check your connection and try again.')
      setImporting(false)
      return
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data.error === 'string' ? data.error : 'Could not import the games. Try again.')
      setImporting(false)
      return
    }
    router.refresh()
    router.push(`/new/${slug}/live`)
  }

  const count = games.length
  return (
    <StepShell
      eyebrow={<StepEyebrow n={7} offset={stepOffset} />}
      title="Any past results?"
      sub="Every game you add makes your first lineups fairer. After five games a player's rating stands on results, not your gut call. Four to six games is the sweet spot."
      action={
        <>
          <button type="button" className={PRIMARY_BUTTON} disabled={count === 0 || importing} onClick={importAll}>
            {importing ? 'Importing…' : count === 0 ? 'Import games and finish' : `Import ${count} ${count === 1 ? 'game' : 'games'} and finish`}
          </button>
          {error && <p role="alert" className="mt-3 text-center font-inter-body text-[13px] text-[#e2686f]">{error}</p>}
        </>
      }
      secondary={<button type="button" className={SECONDARY_LINK} onClick={() => router.push(`/new/${slug}/live`)}>Skip for now</button>}
    >
      <section className="rounded-lg border border-[#1b2c46] bg-[#0a1421] p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-inter-body text-sm font-semibold text-[#f4f9ff]">Lineup confidence</p>
            <p className="mt-0.5 font-inter-body text-[12.5px] text-[#8ba4c4]">{line}</p>
          </div>
          <span className={cn('flex h-11 min-w-16 items-center justify-center rounded-lg border px-2 font-plex text-xl font-bold', TONES[tone])}>{percent}%</span>
        </div>
        <div className="mt-4 grid grid-cols-10 gap-[3px]" aria-hidden>
          {Array.from({ length: 10 }, (_, i) => <span key={i} className={cn('h-2 rounded-sm', i < count ? FILLS[tone] : 'bg-[#1b2c46]')} />)}
        </div>
        <div className="relative mt-1.5 h-3 font-plex text-[9px] font-bold uppercase tracking-[.12em]">
          {TICKS.map(([at, text]) => (
            <span key={at} className={cn('absolute', count >= at ? 'text-[#f4f9ff]' : 'text-[#4f688a]', at === 0 ? 'left-0' : at === 10 ? 'right-0' : '-translate-x-1/2')} style={at === 0 || at === 10 ? undefined : { left: `${at * 10}%` }}>
              {text}
            </span>
          ))}
        </div>
      </section>

      {sorted.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {sorted.map((g, i) => (
            <li key={g.id}>
              <button type="button" onClick={() => setOpen({ draft: g, editing: true })} className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#1b2c46] bg-[#0a1421] px-[18px] py-3 text-left transition-colors hover:border-[#2c4a72]">
                <span>
                  <span className="block text-sm font-bold text-[#f4f9ff]">Game {sorted.length - i}</span>
                  <span className="mt-0.5 block font-plex text-[9.5px] uppercase tracking-[.14em] text-[#6f88a8]">{parseInt(g.date, 10)} {g.date.slice(3)} · {sidesFormat(g.teamA.length, g.teamB.length)}</span>
                </span>
                <ResultChip winner={g.winner} goalDifference={g.goalDifference} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={newDraft} className="mt-3 flex h-[50px] w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#223a5c] text-sm font-bold text-[#8ba4c4] transition-colors hover:border-[#38bdf8] hover:text-[#f4f9ff]">
        <Plus className="size-4" />
        {count === 0 ? 'Add a game' : 'Add another game'}
      </button>
      <p className="mt-3 text-center font-inter-body text-[12.5px] text-[#6f88a8]">Each new game starts a week earlier with the last lineups in place, so you only move who changed.</p>

      {open && (
        <ImportGameModal
          leagueId={leagueId}
          number={open.editing ? sorted.length - sorted.findIndex((g) => g.id === open.draft.id) : count + 1}
          draft={open.draft}
          editing={open.editing}
          roster={roster}
          latestMatchDay={latestMatchDay}
          takenDates={games.filter((g) => g.id !== open.draft.id).map((g) => g.date)}
          onRosterAdd={(name) => setRoster((r) => [...r, name].sort())}
          onSave={saveDraft}
          onDelete={() => { setGames((gs) => gs.filter((g) => g.id !== open.draft.id)); setOpen(null) }}
          onClose={() => setOpen(null)}
        />
      )}
    </StepShell>
  )
}
```

The tick labels use a `style` for a percentage offset. CLAUDE.md forbids `style` for layout; replace it with Tailwind arbitrary classes `left-[30%]` and `left-[60%]` chosen by `at` (a small lookup: `{3: 'left-[30%] -translate-x-1/2', 6: 'left-[60%] -translate-x-1/2'}`) so no `style` prop remains.

- [ ] **Step 4: ResultsScreen**

```tsx
// components/new-league/ResultsScreen.tsx
import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getAuthAndRole, getGameBySlug } from '@/lib/fetchers'
import { createServiceClient } from '@/lib/supabase/service'
import { dayNameToIndex, formatWeekDate, getMostRecentExpectedGameDate, leagueNow } from '@/lib/dates'
import { leagueLandingPath, VIEWPORT_COOKIE } from '@/lib/utils'
import { NEW_VISITOR_COOKIE } from './StepShell'
import { ResultsStep } from './ResultsStep'

/** The past results step. Admins only. */
export async function ResultsScreen({ slug }: { slug: string }) {
  const game = await getGameBySlug(slug)
  if (!game) notFound()
  const { userRole } = await getAuthAndRole(game.id)
  if (userRole !== 'creator' && userRole !== 'admin') {
    redirect(leagueLandingPath(slug, (await headers()).get('user-agent'), (await cookies()).get(VIEWPORT_COOKIE)?.value))
  }

  const { data: roster } = await createServiceClient().from('player_attributes').select('name').eq('game_id', game.id).order('name')
  const dayIndex = dayNameToIndex(game.day)
  // The stepper's upper bound: the league's last match day up to today, or today without a match day.
  const latestMatchDay = (dayIndex === null ? null : getMostRecentExpectedGameDate([], dayIndex)) ?? formatWeekDate(leagueNow())
  const stepOffset = (await cookies()).get(NEW_VISITOR_COOKIE) ? 1 : 0

  return <ResultsStep leagueId={game.id} slug={slug} roster={(roster ?? []).map((r) => r.name as string)} latestMatchDay={latestMatchDay} stepOffset={stepOffset} />
}
```

- [ ] **Step 5: Wiring**
  - `StepShell.tsx`: `STEP_COUNT = 7`.
  - `RosterWizard.tsx`: after a successful save, `router.push(\`/new/${slug}/results\`)` (keep the `router.refresh()` before it).
  - `app/new/[[...step]]/page.tsx`: add `import { ResultsScreen } from '@/components/new-league/ResultsScreen'`, `const isResults = (step: string[]) => step.length === 2 && step[1] === 'results'`, a title `'Past results'` for it in `generateMetadata`, and `if (isResults(step)) return <ResultsScreen slug={step[0]} />` after the roster branch. Update the doc comment.
  - `LiveScreen.tsx`: import `getWeeks` from fetchers and `getPlayedWeeks` from `@/lib/dates`, `getNextWeekNumber` and `seasonOfDate` from `@/lib/utils`. Load `const weeks = await getWeeks(game.id)`, `const played = getPlayedWeeks(weeks).length`. When `nextDate` exists, the sub becomes `${played > 0 ? `${played} ${played === 1 ? 'game' : 'games'} imported. ` : ''}Week ${getNextWeekNumber(weeks, seasonOfDate(nextDate))} is in the diary for ${formatLongFixtureDate(nextDate)}.`

- [ ] **Step 6: Check.** `npx tsc --noEmit && npx eslint components/new-league app/new && npm test -- __tests__/results-step.test.tsx`. Then with the dev server: signed-out `curl -sI http://localhost:3000/new/craft-football/results | head -2` is a 307 to sign-in and the log shows no compile error.

- [ ] **Step 7: Commit**

```bash
git add components/new-league app/new __tests__/results-step.test.tsx
git commit -m "Add the past results step and import modal

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Verify and open the PR

- [ ] `npm test`, `npx tsc --noEmit`, `npm run build && npm run bundle-report` (note the `/new` route size; `EditWeekModal` pieces are shared with Results so the growth should be modest).
- [ ] Apply `supabase/migrations/20261111000002_import_weeks.sql` in the SQL editor (Will) and run the manual check from the spec.
- [ ] Push and open the PR against `awmloveland/league-creation-account`:

```bash
git push -u origin HEAD
gh pr create --base awmloveland/league-creation-account --title "League creation 4/5: past results import" --body "$(cat <<'EOF'
## Summary
Stacked on #196. After Strength the admin can enter past games and import them in one call (handoff screen 8 and the game modal), landing on Live with the first line-ups seeded.

- `import_weeks` RPC validates each game, inserts played weeks, adds roster rows for new names and renumbers the league's weeks by date per season; `POST /api/league/[id]/weeks/import` calls it once
- The game modal reuses `EditWeekModal`'s line-up editor and result picker, adding a week-by-week date stepper; "+ Add player" uses `AddRosterPlayerModal`
- The Results step has the Lineup confidence card, the saved games list, Skip for now
- Weeks dated before the league's `created_at` are left out of the fee books, and `ensureUnrecordedWeek` never creates a missed week for a game day before creation
- Live reads "N games imported. Week N+1 is in the diary for …"

Spec: docs/superpowers/specs/2026-11-11-league-creation-slice-4-design.md

## Deploy note
Run `supabase/migrations/20261111000002_import_weeks.sql` in the SQL editor before this deploys.

## Test plan
- [ ] `npm test`, `npx tsc --noEmit`, `npm run build`
- [ ] Signed in: create a league, add players, enter three past games (one a draw, one with a new name added from the modal), import, check Results numbering and no unrecorded week, Admin shows no fee debt for them, Live says "3 games imported", delete the league

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
