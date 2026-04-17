# Season / Year Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add calendar-year seasons to BootRoom — resetting week numbers each year, adding a year-jump nav to the results page, and a per-player year toggle on the players page.

**Architecture:** A DB migration backfills `weeks.season` to a plain 4-digit year and renumbers weeks within each year. A second migration fixes cross-year `recentForm` ordering in both player stats RPCs. UI changes are layered on top: year anchors + `YearJumpNav` on results; animated year dropdown + client-side `computeYearStats` on players.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Supabase (PostgreSQL), Radix UI Collapsible, Jest

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/20260417000001_season_year_reset.sql` | Create | Backfill season=year, renumber weeks per year |
| `supabase/migrations/20260417000002_fix_recent_form_ordering.sql` | Create | Fix season-aware recentForm in both RPCs |
| `lib/types.ts` | Modify | Add `season` to `Week`, add `YearStats` interface |
| `lib/fetchers.ts` | Modify | Add `season` to `WeekRow` + `mapWeekRow` + select |
| `lib/utils.ts` | Modify | Simplify `deriveSeason`, update `getNextWeekNumber`, add `computeYearStats` |
| `lib/__tests__/utils.season.test.ts` | Create | Tests for `deriveSeason`, `getNextWeekNumber`, `computeYearStats` |
| `components/YearDivider.tsx` | Create | Visual year-change divider with scroll anchor |
| `components/YearJumpNav.tsx` | Create | Floating year-jump pill nav (hidden below lg breakpoint) |
| `components/WeekList.tsx` | Modify | Insert `YearDivider` on year boundary |
| `components/PublicMatchList.tsx` | Modify | Insert `YearDivider` on year boundary |
| `components/PlayerCard.tsx` | Modify | Accept `weeks` prop, animated year dropdown, year-filtered stats |
| `components/PublicPlayerList.tsx` | Modify | Accept + thread `weeks` prop to each `PlayerCard` |
| `app/[slug]/results/page.tsx` | Modify | Render `YearJumpNav`, update progress bar to current-year week count |
| `app/[slug]/players/page.tsx` | Modify | Pass `weeks` to `PublicPlayerList` |

---

## Task 1: DB Migration — backfill season and renumber weeks

**Files:**
- Create: `supabase/migrations/20260417000001_season_year_reset.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 1. Drop the existing UNIQUE constraint on (season, week) — name varies by DB.
--    We find it dynamically to handle any naming.
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'weeks'::regclass
    AND contype = 'u'
    AND array_to_string(
          ARRAY(
            SELECT attname FROM pg_attribute
            WHERE attrelid = conrelid
              AND attnum = ANY(conkey)
            ORDER BY attnum
          ), ','
        ) LIKE '%season%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE 'ALTER TABLE weeks DROP CONSTRAINT ' || quote_ident(v_constraint);
  END IF;
END $$;

-- 2. Backfill season = calendar year extracted from date ('DD MMM YYYY' → 'YYYY')
UPDATE weeks
SET season = split_part(date, ' ', 3);

-- 3. Renumber weeks within each (game_id, season), preserving chronological order.
--    Uses the old sequential week number as the ordering key — correct because
--    weeks within a year were always in ascending order before this migration.
WITH renumbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY game_id, season
      ORDER BY week ASC
    )::int AS new_week
  FROM weeks
)
UPDATE weeks
SET week = renumbered.new_week
FROM renumbered
WHERE weeks.id = renumbered.id;

-- 4. Recreate the constraint scoped to (game_id, season, week).
ALTER TABLE weeks
  ADD CONSTRAINT weeks_game_season_week_key UNIQUE (game_id, season, week);
```

- [ ] **Step 2: Run the migration in the Supabase SQL Editor**

Paste the full SQL into Supabase → SQL Editor → Run. Verify no errors. Then run:
```sql
SELECT game_id, season, MIN(week) AS first_week, MAX(week) AS last_week, COUNT(*) AS total
FROM weeks
GROUP BY game_id, season
ORDER BY game_id, season;
```
Expected: each (game_id, season) group starts at week 1 and has no gaps in ordering relative to original sequence.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260417000001_season_year_reset.sql
git commit -m "feat: backfill season as calendar year and reset week numbers per year"
```

---

## Task 2: DB Migration — fix recentForm ordering across years

**Files:**
- Create: `supabase/migrations/20260417000002_fix_recent_form_ordering.sql`

- [ ] **Step 1: Write the migration**

The `player_games` CTE in both RPCs must expose `w.season` so the `ranked` CTE can sort by `(season DESC, week DESC)` instead of `week DESC` alone.

```sql
-- Fix get_player_stats (members)
CREATE OR REPLACE FUNCTION public.get_player_stats(p_game_id uuid)
RETURNS TABLE (
  name        text,
  played      bigint,
  won         bigint,
  drew        bigint,
  lost        bigint,
  "timesTeamA" bigint,
  "timesTeamB" bigint,
  "winRate"   numeric,
  qualified   boolean,
  points      bigint,
  goalkeeper  boolean,
  mentality   text,
  rating      int,
  "recentForm" text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = p_game_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this game';
  END IF;

  RETURN QUERY
  WITH player_games AS (
    SELECT
      w.season,
      w.week,
      w.winner,
      p.name,
      p.team
    FROM weeks w
    CROSS JOIN LATERAL (
      SELECT jsonb_array_elements_text(w.team_a) AS name, 'A' AS team
      UNION ALL
      SELECT jsonb_array_elements_text(w.team_b) AS name, 'B' AS team
    ) p
    WHERE w.game_id = p_game_id AND w.status = 'played'
  ),
  player_aggregates AS (
    SELECT
      pg.name,
      COUNT(*)::bigint AS played,
      COUNT(*) FILTER (
        WHERE (pg.team = 'A' AND pg.winner = 'teamA')
           OR (pg.team = 'B' AND pg.winner = 'teamB')
      )::bigint AS won,
      COUNT(*) FILTER (WHERE pg.winner = 'draw')::bigint AS drew,
      COUNT(*) FILTER (
        WHERE (pg.team = 'A' AND pg.winner = 'teamB')
           OR (pg.team = 'B' AND pg.winner = 'teamA')
      )::bigint AS lost,
      COUNT(*) FILTER (WHERE pg.team = 'A')::bigint AS times_team_a,
      COUNT(*) FILTER (WHERE pg.team = 'B')::bigint AS times_team_b
    FROM player_games pg
    GROUP BY pg.name
  ),
  config_vals AS (
    SELECT
      COALESCE((c.value->'minGamesForQualifiedWinRate')::int, 5) AS min_games,
      COALESCE((c.value->'pointsSystem'->>'win')::int, 3)        AS win_pts,
      COALESCE((c.value->'pointsSystem'->>'draw')::int, 1)       AS draw_pts,
      COALESCE((c.value->'pointsSystem'->>'loss')::int, 0)       AS loss_pts
    FROM config c
    WHERE c.game_id = p_game_id AND c.key = 'config'
    LIMIT 1
  ),
  ranked AS (
    SELECT pg.name, pg.team, pg.winner, pg.season, pg.week,
      ROW_NUMBER() OVER (
        PARTITION BY pg.name ORDER BY pg.season DESC, pg.week DESC
      ) AS rn
    FROM player_games pg
  ),
  recent_form AS (
    SELECT rf.name,
      string_agg(
        CASE
          WHEN (rf.team = 'A' AND rf.winner = 'teamA')
            OR (rf.team = 'B' AND rf.winner = 'teamB') THEN 'W'
          WHEN rf.winner = 'draw' THEN 'D'
          ELSE 'L'
        END,
        '' ORDER BY rf.season DESC, rf.week DESC
      ) AS form
    FROM ranked rf
    WHERE rf.rn <= 5
    GROUP BY rf.name
  )
  SELECT
    pa.name, pa.played, pa.won, pa.drew, pa.lost,
    pa.times_team_a, pa.times_team_b,
    CASE WHEN pa.played > 0
      THEN ROUND((pa.won::numeric / pa.played) * 100, 1) ELSE 0 END,
    (pa.played >= COALESCE((SELECT min_games FROM config_vals LIMIT 1), 5)),
    (pa.won  * COALESCE((SELECT win_pts  FROM config_vals LIMIT 1), 3) +
     pa.drew * COALESCE((SELECT draw_pts FROM config_vals LIMIT 1), 1) +
     pa.lost * COALESCE((SELECT loss_pts FROM config_vals LIMIT 1), 0))::bigint,
    COALESCE(attr.goalkeeper, false),
    COALESCE(attr.mentality,  'balanced'),
    COALESCE(attr.rating,     0),
    COALESCE(rf.form, '')
  FROM player_aggregates pa
  LEFT JOIN player_attributes attr
    ON attr.game_id = p_game_id AND attr.name = pa.name
  LEFT JOIN recent_form rf ON rf.name = pa.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_stats(uuid) TO authenticated;

-- Fix get_player_stats_public (service role / public tier)
CREATE OR REPLACE FUNCTION public.get_player_stats_public(p_game_id uuid)
RETURNS TABLE (
  name          text,
  played        bigint,
  won           bigint,
  drew          bigint,
  lost          bigint,
  "timesTeamA"  bigint,
  "timesTeamB"  bigint,
  "winRate"     numeric,
  qualified     boolean,
  points        bigint,
  goalkeeper    boolean,
  mentality     text,
  rating        int,
  "recentForm"  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH player_games AS (
    SELECT
      w.season,
      w.week,
      w.winner,
      p.name,
      p.team
    FROM weeks w
    CROSS JOIN LATERAL (
      SELECT jsonb_array_elements_text(w.team_a) AS name, 'A' AS team
      UNION ALL
      SELECT jsonb_array_elements_text(w.team_b) AS name, 'B' AS team
    ) p
    WHERE w.game_id = p_game_id AND w.status = 'played'
  ),
  player_aggregates AS (
    SELECT
      pg.name,
      COUNT(*)::bigint AS played,
      COUNT(*) FILTER (
        WHERE (pg.team = 'A' AND pg.winner = 'teamA')
           OR (pg.team = 'B' AND pg.winner = 'teamB')
      )::bigint AS won,
      COUNT(*) FILTER (WHERE pg.winner = 'draw')::bigint AS drew,
      COUNT(*) FILTER (
        WHERE (pg.team = 'A' AND pg.winner = 'teamB')
           OR (pg.team = 'B' AND pg.winner = 'teamA')
      )::bigint AS lost,
      COUNT(*) FILTER (WHERE pg.team = 'A')::bigint AS times_team_a,
      COUNT(*) FILTER (WHERE pg.team = 'B')::bigint AS times_team_b
    FROM player_games pg
    GROUP BY pg.name
  ),
  config_vals AS (
    SELECT
      COALESCE((c.value->'minGamesForQualifiedWinRate')::int, 5) AS min_games,
      COALESCE((c.value->'pointsSystem'->>'win')::int, 3)        AS win_pts,
      COALESCE((c.value->'pointsSystem'->>'draw')::int, 1)       AS draw_pts,
      COALESCE((c.value->'pointsSystem'->>'loss')::int, 0)       AS loss_pts
    FROM config c
    WHERE c.game_id = p_game_id AND c.key = 'config'
    LIMIT 1
  ),
  ranked AS (
    SELECT pg.name, pg.team, pg.winner, pg.season, pg.week,
      ROW_NUMBER() OVER (
        PARTITION BY pg.name ORDER BY pg.season DESC, pg.week DESC
      ) AS rn
    FROM player_games pg
  ),
  recent_form AS (
    SELECT rf.name,
      string_agg(
        CASE
          WHEN (rf.team = 'A' AND rf.winner = 'teamA')
            OR (rf.team = 'B' AND rf.winner = 'teamB') THEN 'W'
          WHEN rf.winner = 'draw' THEN 'D'
          ELSE 'L'
        END,
        '' ORDER BY rf.season DESC, rf.week DESC
      ) AS form
    FROM ranked rf
    WHERE rf.rn <= 5
    GROUP BY rf.name
  )
  SELECT
    pa.name, pa.played, pa.won, pa.drew, pa.lost,
    pa.times_team_a, pa.times_team_b,
    CASE WHEN pa.played > 0
      THEN ROUND((pa.won::numeric / pa.played) * 100, 1) ELSE 0 END,
    (pa.played >= COALESCE((SELECT min_games FROM config_vals LIMIT 1), 5)),
    (pa.won  * COALESCE((SELECT win_pts  FROM config_vals LIMIT 1), 3) +
     pa.drew * COALESCE((SELECT draw_pts FROM config_vals LIMIT 1), 1) +
     pa.lost * COALESCE((SELECT loss_pts FROM config_vals LIMIT 1), 0))::bigint,
    COALESCE(attr.goalkeeper, false),
    COALESCE(attr.mentality,  'balanced'),
    COALESCE(attr.rating,     0),
    COALESCE(rf.form, '')
  FROM player_aggregates pa
  LEFT JOIN player_attributes attr
    ON attr.game_id = p_game_id AND attr.name = pa.name
  LEFT JOIN recent_form rf ON rf.name = pa.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_stats_public(uuid) TO service_role;
```

- [ ] **Step 2: Run the migration in Supabase SQL Editor**

Paste and run. Verify no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260417000002_fix_recent_form_ordering.sql
git commit -m "fix: order recentForm by season DESC, week DESC to handle year resets"
```

---

## Task 3: Add `season` to `Week` type and `getWeeks` fetcher

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/fetchers.ts`

- [ ] **Step 1: Add `season` to the `Week` interface in `lib/types.ts`**

Find the `Week` interface (lines 4–20) and add `season` after `id`:

```ts
export interface Week {
  id?: string
  season: string    // ADD THIS — 4-digit calendar year, e.g. '2026'
  week: number
  date: string
  // ... rest unchanged
```

- [ ] **Step 2: Add `season` to `WeekRow` and `mapWeekRow` in `lib/fetchers.ts`**

Find `type WeekRow` (around line 105) and add `season: string`:

```ts
type WeekRow = {
  id: string
  season: string    // ADD THIS
  week: number
  // ... rest unchanged
}
```

Find `function mapWeekRow` (around line 121) and add `season` to the return:

```ts
function mapWeekRow(row: WeekRow): Week {
  return {
    id: row.id,
    season: row.season,    // ADD THIS
    week: row.week,
    // ... rest unchanged
  }
}
```

- [ ] **Step 3: Add `season` to the `getWeeks` select query**

Find the `.select(...)` call in `getWeeks` (line 261) and add `season`:

```ts
.select('id, season, week, date, status, format, team_a, team_b, winner, notes, goal_difference, team_a_rating, team_b_rating, lineup_metadata')
```

- [ ] **Step 4: Fix TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -30
```

The `Week` type now requires `season`. Any test fixtures or mock `Week` objects that omit `season` will error. Add `season: '2026'` (or appropriate year) to each fixture. Common locations: `lib/__tests__/`, `__tests__/`.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/fetchers.ts
git commit -m "feat: add season field to Week type and getWeeks fetcher"
```

---

## Task 4: Update utility functions

**Files:**
- Modify: `lib/utils.ts`
- Create: `lib/__tests__/utils.season.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// lib/__tests__/utils.season.test.ts
import { deriveSeason, getNextWeekNumber } from '@/lib/utils'
import type { Week } from '@/lib/types'

function makeWeek(overrides: Partial<Week>): Week {
  return {
    season: '2026',
    week: 1,
    date: '01 Jan 2026',
    status: 'played',
    teamA: [],
    teamB: [],
    winner: null,
    ...overrides,
  }
}

describe('deriveSeason', () => {
  it('returns the season of the most recently played week', () => {
    const weeks = [
      makeWeek({ season: '2025', week: 50, date: '05 Dec 2025', status: 'played' }),
      makeWeek({ season: '2026', week: 3,  date: '15 Jan 2026', status: 'played' }),
    ]
    expect(deriveSeason(weeks)).toBe('2026')
  })

  it('falls back to current calendar year when no played weeks exist', () => {
    const year = String(new Date().getFullYear())
    expect(deriveSeason([])).toBe(year)
    expect(deriveSeason([makeWeek({ status: 'cancelled' })])).toBe(year)
  })
})

describe('getNextWeekNumber', () => {
  it('returns 1 when no weeks exist in the current year', () => {
    const currentYear = String(new Date().getFullYear())
    const pastYear = String(Number(currentYear) - 1)
    const weeks = [makeWeek({ season: pastYear, week: 52 })]
    expect(getNextWeekNumber(weeks)).toBe(1)
  })

  it('returns max week + 1 within the current year', () => {
    const currentYear = String(new Date().getFullYear())
    const weeks = [
      makeWeek({ season: currentYear, week: 5 }),
      makeWeek({ season: currentYear, week: 3 }),
    ]
    expect(getNextWeekNumber(weeks)).toBe(6)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- lib/__tests__/utils.season.test.ts
```

Expected: FAIL (functions exist but have wrong behaviour)

- [ ] **Step 3: Update `deriveSeason` in `lib/utils.ts`**

Replace the existing `deriveSeason` function (find it around line 383):

```ts
export function deriveSeason(weeks: Week[]): string {
  const played = getPlayedWeeks(weeks)
  if (played.length === 0) return String(new Date().getFullYear())
  const latest = [...played].sort((a, b) => {
    if (a.season !== b.season) return b.season.localeCompare(a.season)
    return b.week - a.week
  })[0]
  return latest.season
}
```

- [ ] **Step 4: Update `getNextWeekNumber` in `lib/utils.ts`**

Replace the existing `getNextWeekNumber` function:

```ts
export function getNextWeekNumber(weeks: Week[]): number {
  const currentYear = String(new Date().getFullYear())
  const thisYear = weeks.filter((w) => w.season === currentYear)
  if (thisYear.length === 0) return 1
  return Math.max(...thisYear.map((w) => w.week)) + 1
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm test -- lib/__tests__/utils.season.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.season.test.ts
git commit -m "feat: update deriveSeason and getNextWeekNumber to use year-scoped seasons"
```

---

## Task 5: Add `YearStats` type and `computeYearStats` utility

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/utils.ts`
- Modify: `lib/__tests__/utils.season.test.ts`

- [ ] **Step 1: Add `YearStats` to `lib/types.ts`**

Add after the `SortKey` type (near the end of the file):

```ts
export interface YearStats {
  played: number
  won: number
  drew: number
  lost: number
  winRate: number   // rounded to 1 decimal, e.g. 60.7
  points: number    // W=3, D=1, L=0
  recentForm: string  // last 5 games in that year newest-first, padded with '-', e.g. 'WWDL-'
  qualified: boolean  // played >= 5 within that year
}
```

- [ ] **Step 2: Write failing tests for `computeYearStats`**

Add to `lib/__tests__/utils.season.test.ts`:

```ts
import { deriveSeason, getNextWeekNumber, computeYearStats } from '@/lib/utils'

describe('computeYearStats', () => {
  const weeks: Week[] = [
    // 2026 games — player is on teamA for all
    makeWeek({ season: '2026', week: 1, teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    makeWeek({ season: '2026', week: 2, teamA: ['Alice'], teamB: ['Bob'], winner: 'teamB' }),
    makeWeek({ season: '2026', week: 3, teamA: ['Alice'], teamB: ['Bob'], winner: 'draw' }),
    makeWeek({ season: '2026', week: 4, teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    makeWeek({ season: '2026', week: 5, teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    makeWeek({ season: '2026', week: 6, teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    // 2025 game — should be excluded when year='2026'
    makeWeek({ season: '2025', week: 50, teamA: ['Alice'], teamB: ['Bob'], winner: 'teamB' }),
  ]

  it('counts only games in the given year', () => {
    const stats = computeYearStats('Alice', weeks, '2026')
    expect(stats.played).toBe(6)
    expect(stats.won).toBe(4)
    expect(stats.drew).toBe(1)
    expect(stats.lost).toBe(1)
  })

  it('computes win rate correctly', () => {
    const stats = computeYearStats('Alice', weeks, '2026')
    expect(stats.winRate).toBe(66.7)
  })

  it('computes points as W=3 D=1 L=0', () => {
    const stats = computeYearStats('Alice', weeks, '2026')
    expect(stats.points).toBe(13) // 4×3 + 1×1 + 1×0
  })

  it('builds recentForm newest-first from last 5 games in that year', () => {
    const stats = computeYearStats('Alice', weeks, '2026')
    // Weeks 6,5,4,3,2 → W,W,W,D,L
    expect(stats.recentForm).toBe('WWWDL')
  })

  it('marks qualified=true when played >= 5', () => {
    expect(computeYearStats('Alice', weeks, '2026').qualified).toBe(true)
  })

  it('marks qualified=false when played < 5', () => {
    const stats = computeYearStats('Alice', weeks, '2025')
    expect(stats.played).toBe(1)
    expect(stats.qualified).toBe(false)
  })

  it('returns zero stats for a player not in any weeks of that year', () => {
    const stats = computeYearStats('Nobody', weeks, '2026')
    expect(stats.played).toBe(0)
    expect(stats.recentForm).toBe('-----')
  })

  it('excludes cancelled weeks', () => {
    const withCancelled = [
      ...weeks,
      makeWeek({ season: '2026', week: 7, status: 'cancelled', teamA: ['Alice'], teamB: ['Bob'], winner: null }),
    ]
    expect(computeYearStats('Alice', withCancelled, '2026').played).toBe(6)
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npm test -- lib/__tests__/utils.season.test.ts
```

Expected: FAIL (`computeYearStats is not a function`)

- [ ] **Step 4: Implement `computeYearStats` in `lib/utils.ts`**

Add after the `getNextWeekNumber` function:

```ts
export function computeYearStats(playerName: string, weeks: Week[], year: string): import('./types').YearStats {
  const yearPlayed = weeks.filter(
    (w) => w.status === 'played' && w.season === year &&
      (w.teamA.includes(playerName) || w.teamB.includes(playerName))
  )

  let won = 0, drew = 0, lost = 0
  for (const w of yearPlayed) {
    const onTeamA = w.teamA.includes(playerName)
    if (w.winner === 'draw') { drew++ }
    else if ((w.winner === 'teamA' && onTeamA) || (w.winner === 'teamB' && !onTeamA)) { won++ }
    else { lost++ }
  }

  const played = yearPlayed.length
  const winRate = played > 0 ? Math.round((won / played) * 1000) / 10 : 0
  const points = won * 3 + drew

  const recent = [...yearPlayed]
    .sort((a, b) => b.week - a.week)
    .slice(0, 5)
    .map((w) => {
      const onTeamA = w.teamA.includes(playerName)
      if (w.winner === 'draw') return 'D'
      return (w.winner === 'teamA' && onTeamA) || (w.winner === 'teamB' && !onTeamA) ? 'W' : 'L'
    })
  const recentForm = recent.join('').padEnd(5, '-')

  return { played, won, drew, lost, winRate, points, recentForm, qualified: played >= 5 }
}
```

Also add the import at the top of `lib/utils.ts` (or inline the type — the function can just return the shape). Since `YearStats` is in `lib/types.ts`, update the import at line 3:

```ts
import { LeagueDetails, Player, Week, Winner, YearStats } from './types'
```

And change the return type annotation:

```ts
export function computeYearStats(playerName: string, weeks: Week[], year: string): YearStats {
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm test -- lib/__tests__/utils.season.test.ts
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/utils.ts lib/__tests__/utils.season.test.ts
git commit -m "feat: add YearStats type and computeYearStats utility"
```

---

## Task 6: Add year dividers + anchors to WeekList and PublicMatchList

**Files:**
- Create: `components/YearDivider.tsx`
- Modify: `components/WeekList.tsx`
- Modify: `components/PublicMatchList.tsx`

- [ ] **Step 1: Create `components/YearDivider.tsx`**

```tsx
interface Props {
  year: string
}

export function YearDivider({ year }: Props) {
  return (
    <div id={`year-${year}`} className="flex items-center gap-3 px-1 py-2">
      <div className="h-px flex-1 bg-slate-700" />
      <span className="text-xs font-semibold tracking-widest text-slate-500 uppercase">
        {year}
      </span>
      <div className="h-px flex-1 bg-slate-700" />
    </div>
  )
}
```

- [ ] **Step 2: Update `components/WeekList.tsx`**

Add the import at the top:

```tsx
import { YearDivider } from '@/components/YearDivider'
```

Inside the `weeks.map((week, index) => { ... })` block, add year change detection alongside the existing month detection:

```tsx
weeks.map((week, index) => {
  const monthChanged =
    index > 0 &&
    getMonthKey(week.date) !== getMonthKey(weeks[index - 1].date)
  const yearChanged =
    index > 0 && week.season !== weeks[index - 1].season

  return (
    <Fragment key={week.week}>
      {yearChanged && <YearDivider year={week.season} />}
      {monthChanged && !yearChanged && <MonthDivider label={formatMonthYear(week.date)} />}
      <MatchCard ... />
    </Fragment>
  )
})
```

Note: when `yearChanged` is true we show `YearDivider` instead of `MonthDivider` — no need to show both.

Also add the first-year anchor at the top (index === 0). Wrap the existing return in:

```tsx
return (
  <div className="flex flex-col gap-3">
    <div id={`year-${weeks[0]?.season}`} />
    {weeks.map((week, index) => { ... })}
  </div>
)
```

- [ ] **Step 3: Update `components/PublicMatchList.tsx`**

Same changes — import `YearDivider`, add year change detection and first-year anchor:

```tsx
import { YearDivider } from '@/components/YearDivider'

// Inside the component return:
return (
  <div className="flex flex-col gap-3">
    <div id={`year-${weeks[0]?.season}`} />
    {weeks.map((week, index) => {
      const monthChanged =
        index > 0 &&
        getMonthKey(week.date) !== getMonthKey(weeks[index - 1].date)
      const yearChanged =
        index > 0 && week.season !== weeks[index - 1].season
      return (
        <Fragment key={week.week}>
          {yearChanged && <YearDivider year={week.season} />}
          {monthChanged && !yearChanged && <MonthDivider label={formatMonthYear(week.date)} />}
          <MatchCard ... />
        </Fragment>
      )
    })}
  </div>
)
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add components/YearDivider.tsx components/WeekList.tsx components/PublicMatchList.tsx
git commit -m "feat: add year anchor dividers to WeekList and PublicMatchList"
```

---

## Task 7: Create `YearJumpNav` and wire into results page

**Files:**
- Create: `components/YearJumpNav.tsx`
- Modify: `app/[slug]/results/page.tsx`

- [ ] **Step 1: Create `components/YearJumpNav.tsx`**

```tsx
'use client'

interface Props {
  years: string[]  // descending order, e.g. ['2026', '2025']
}

export function YearJumpNav({ years }: Props) {
  if (years.length <= 1) return null

  return (
    <div className="hidden lg:flex items-center gap-2 mb-3">
      <span className="text-[10px] text-slate-500 uppercase tracking-widest shrink-0">
        Jump to
      </span>
      {years.map((year) => (
        <button
          key={year}
          type="button"
          onClick={() =>
            document.getElementById(`year-${year}`)?.scrollIntoView({ behavior: 'smooth' })
          }
          className="text-xs px-2.5 py-1 rounded-full border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300 transition-colors"
        >
          {year}
        </button>
      ))}
    </div>
  )
}
```

`hidden lg:block` ensures the nav disappears before the sidebar does on narrowing viewports — the sidebar follows its own existing `SidebarSticky` / `MobileStatsFAB` pattern.

- [ ] **Step 2: Update the progress bar calculation in `app/[slug]/results/page.tsx`**

Find the current `playedCount` / `totalWeeks` lines (around line 144) and replace:

```tsx
// Current year's week count for the progress bar.
// Falls back to previous year if no games played yet this year (e.g. early January).
const currentYear = String(new Date().getFullYear())
const currentYearWeeks = weeks.filter(
  (w) => w.season === currentYear && (w.status === 'played' || w.status === 'cancelled')
)
const playedCount = currentYearWeeks.length > 0
  ? Math.max(...currentYearWeeks.map((w) => w.week))
  : (() => {
      const prevYear = String(new Date().getFullYear() - 1)
      const prevYearWeeks = weeks.filter(
        (w) => w.season === prevYear && (w.status === 'played' || w.status === 'cancelled')
      )
      return prevYearWeeks.length > 0 ? Math.max(...prevYearWeeks.map((w) => w.week)) : 0
    })()
const totalWeeks = 52
const pct = Math.round((playedCount / totalWeeks) * 100)
```

- [ ] **Step 3: Derive `availableYears` and render `YearJumpNav` in `app/[slug]/results/page.tsx`**

After the `playedCount` block, add:

```tsx
// Unique years descending — used for year-jump nav and YearDivider anchors.
const availableYears = Array.from(
  new Set(
    weeks
      .filter((w) => w.status === 'played' || w.status === 'cancelled')
      .map((w) => w.season)
  )
).sort((a, b) => b.localeCompare(a))
```

Add the import at the top of the file:

```tsx
import { YearJumpNav } from '@/components/YearJumpNav'
```

Then render it above `WeekList` / `PublicMatchList` in both the public and member/admin render paths. In the public path, inside the `canSeeMatchHistory` section:

```tsx
{canSeeMatchHistory && (
  <section>
    <YearJumpNav years={availableYears} />
    <PublicMatchList weeks={weeks} />
  </section>
)}
```

In the member/admin path, wrap the existing `WeekList` / `ResultsSection`:

```tsx
<div className="flex flex-col gap-3">
  <YearJumpNav years={availableYears} />
  {canSeeMatchEntry ? (
    <ResultsSection ... />
  ) : canSeeMatchHistory ? (
    <WeekList ... />
  ) : (
    <div className="py-16 text-center">
      <p className="text-sm text-slate-500">Nothing to show here yet.</p>
    </div>
  )}
</div>
```

- [ ] **Step 4: Do the same progress bar update in `app/[slug]/players/page.tsx`**

The players page has its own `playedCount`. Find it (around line 64) and replace with the same year-scoped logic:

```tsx
const currentYear = String(new Date().getFullYear())
const currentYearPlayedWeeks = playedWeeks.filter((w) => w.season === currentYear)
const playedCount = currentYearPlayedWeeks.length > 0
  ? Math.max(...currentYearPlayedWeeks.map((w) => w.week))
  : (() => {
      const prevYear = String(new Date().getFullYear() - 1)
      const prev = playedWeeks.filter((w) => w.season === prevYear)
      return prev.length > 0 ? Math.max(...prev.map((w) => w.week)) : 0
    })()
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add components/YearJumpNav.tsx app/[slug]/results/page.tsx app/[slug]/players/page.tsx
git commit -m "feat: add YearJumpNav and update progress bar to current-year week count"
```

---

## Task 8: Add year toggle to `PlayerCard`

**Files:**
- Modify: `components/PlayerCard.tsx`

The year dropdown animates in when the card opens. It only renders when the player has appeared in weeks across more than one calendar year. Default is "All Time" (no filter). When a year is selected, `computeYearStats` replaces the all-time stats.

- [ ] **Step 1: Update the `PlayerCardProps` interface and imports**

At the top of `components/PlayerCard.tsx`, add the import:

```tsx
import { computeYearStats } from '@/lib/utils'
import type { Week, YearStats } from '@/lib/types'
```

Update the interface:

```tsx
interface PlayerCardProps {
  player: Player
  isOpen: boolean
  onToggle: () => void
  sortBy: SortKey
  visibleStats?: string[]
  showMentality?: boolean
  weeks?: Week[]   // ADD — needed for year-filtered stats; undefined = no year toggle
}
```

- [ ] **Step 2: Add state and derived values inside `PlayerCard`**

Inside the `PlayerCard` function body, after the existing declarations, add:

```tsx
const [selectedYear, setSelectedYear] = useState<string | null>(null)
const [dropdownOpen, setDropdownOpen] = useState(false)
const dropdownRef = useRef<HTMLDivElement>(null)

// Derive which years this player has appeared in
const playerYears: string[] = useMemo(() => {
  if (!weeks) return []
  const years = new Set(
    weeks
      .filter(
        (w) =>
          w.status === 'played' &&
          (w.teamA.includes(player.name) || w.teamB.includes(player.name))
      )
      .map((w) => w.season)
  )
  return Array.from(years).sort()  // ascending: ['2025', '2026']
}, [weeks, player.name])

const showYearToggle = playerYears.length > 1

// Stats to display — year-filtered or all-time
const yearStats: YearStats | null = useMemo(() => {
  if (!selectedYear || !weeks) return null
  return computeYearStats(player.name, weeks, selectedYear)
}, [selectedYear, weeks, player.name])

const displayPlayer = yearStats
  ? { ...player, ...yearStats }
  : player
```

Also add `useRef` and `useMemo` to the React import:

```tsx
import { useState, useMemo, useRef, useEffect } from 'react'
```

- [ ] **Step 3: Add click-outside handler to close the dropdown**

After the state declarations:

```tsx
useEffect(() => {
  function handleClickOutside(e: MouseEvent) {
    if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
      setDropdownOpen(false)
    }
  }
  document.addEventListener('mousedown', handleClickOutside)
  return () => document.removeEventListener('mousedown', handleClickOutside)
}, [])
```

- [ ] **Step 4: Update the card header to show the animated year selector**

Replace the existing `<Collapsible.Trigger>` button content. The player name row becomes:

```tsx
<div className="flex items-center min-w-0">
  <span className="text-sm font-semibold text-slate-100 shrink-0">{player.name}</span>
  {showYearToggle && (
    <span
      className={cn(
        'overflow-hidden transition-all duration-200 ease-in-out whitespace-nowrap',
        isOpen ? 'max-w-[140px] opacity-100 ml-1.5' : 'max-w-0 opacity-0 ml-0',
      )}
    >
      <span className="text-slate-500 mr-1 text-sm font-normal">-</span>
      <span className="relative inline-block" ref={dropdownRef}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setDropdownOpen((o) => !o)
          }}
          className="text-sm font-semibold text-sky-400 hover:text-sky-300 inline-flex items-center gap-0.5 focus:outline-none"
        >
          {selectedYear ?? 'All Time'}
          <ChevronDown
            className={cn(
              'h-3 w-3 text-sky-400 transition-transform duration-150',
              dropdownOpen && 'rotate-180',
            )}
          />
        </button>
        {dropdownOpen && (
          <div className="absolute left-0 top-full mt-1 z-20 bg-slate-950 border border-slate-700 rounded-lg overflow-hidden shadow-lg min-w-[100px]">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSelectedYear(null); setDropdownOpen(false) }}
              className={cn(
                'w-full text-left px-3 py-2 text-sm hover:bg-slate-800 transition-colors',
                selectedYear === null ? 'text-sky-400' : 'text-slate-400',
              )}
            >
              All Time
            </button>
            {playerYears.map((year) => (
              <button
                key={year}
                type="button"
                onClick={(e) => { e.stopPropagation(); setSelectedYear(year); setDropdownOpen(false) }}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm hover:bg-slate-800 transition-colors',
                  selectedYear === year ? 'text-sky-400' : 'text-slate-400',
                )}
              >
                {year}
              </button>
            ))}
          </div>
        )}
      </span>
    </span>
  )}
</div>
```

- [ ] **Step 5: Replace `player` with `displayPlayer` in the card body stats**

In the `<Collapsible.Content>` section, replace every reference to `player.winRate`, `player.played`, `player.recentForm`, `player.won`, `player.drew`, `player.lost`, `player.timesTeamA`, `player.timesTeamB` with `displayPlayer.*`. The `resultSegments` and `splitSegments` arrays and the form circles block all derive from `player` — change them to use `displayPlayer`:

```tsx
const resultSegments = [
  { count: displayPlayer.won,  barClass: 'bg-sky-500',   numClass: 'text-sky-400',   label: 'Won'   },
  { count: displayPlayer.drew, barClass: 'bg-slate-600', numClass: 'text-slate-500', label: 'Drawn' },
  { count: displayPlayer.lost, barClass: 'bg-red-500',   numClass: 'text-red-400',   label: 'Lost'  },
].filter(s => s.count > 0)

const splitSegments = [
  { count: displayPlayer.timesTeamA, barClass: 'bg-blue-700',   numClass: 'text-blue-300',   label: 'Team A', align: 'text-left'  },
  { count: displayPlayer.timesTeamB, barClass: 'bg-violet-700', numClass: 'text-violet-300', label: 'Team B', align: 'text-right' },
]
```

And the form display:

```tsx
const raw = displayPlayer.recentForm ?? ''
const formChars = [...raw.padEnd(5, '-')].reverse()
```

And the win rate + played numbers:

```tsx
<p className="text-2xl font-extrabold text-sky-400 leading-none">
  {displayPlayer.winRate.toFixed(1)}%
</p>
// ...
<p className="text-2xl font-extrabold text-slate-100 leading-none">{displayPlayer.played}</p>
```

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add components/PlayerCard.tsx
git commit -m "feat: add animated year toggle to PlayerCard with client-side year-filtered stats"
```

---

## Task 9: Thread `weeks` prop through `PublicPlayerList` to `PlayerCard`

**Files:**
- Modify: `components/PublicPlayerList.tsx`
- Modify: `app/[slug]/players/page.tsx`

- [ ] **Step 1: Update `PublicPlayerList` props interface and thread `weeks` to `PlayerCard`**

In `components/PublicPlayerList.tsx`, update the `Props` interface:

```tsx
interface Props {
  players: Player[]
  visibleStats?: string[]
  showMentality?: boolean
  weeks?: Week[]    // ADD
}
```

Add `Week` to the import:

```tsx
import type { Player, SortKey, Week } from '@/lib/types'
```

Update the function signature:

```tsx
export function PublicPlayerList({ players, visibleStats, showMentality = true, weeks }: Props) {
```

Pass `weeks` to each `PlayerCard`:

```tsx
<PlayerCard
  key={player.name}
  player={player}
  isOpen={openPlayer === player.name}
  onToggle={() => setOpenPlayer((prev) => (prev === player.name ? null : player.name))}
  visibleStats={visibleStats}
  showMentality={showMentality}
  sortBy={sortBy}
  weeks={weeks}     // ADD
/>
```

- [ ] **Step 2: Pass `weeks` from `app/[slug]/players/page.tsx`**

In `app/[slug]/players/page.tsx`, find the `<PublicPlayerList ... />` render (around line 100) and add the `weeks` prop:

```tsx
<PublicPlayerList
  players={players}
  visibleStats={visibleStats}
  showMentality={showMentality}
  weeks={weeks}
/>
```

`weeks` is already fetched on this page and available in scope.

- [ ] **Step 3: TypeScript check and full test run**

```bash
npx tsc --noEmit
npm test
```

Expected: no TypeScript errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add components/PublicPlayerList.tsx app/[slug]/players/page.tsx
git commit -m "feat: thread weeks prop into PublicPlayerList and PlayerCard for year filtering"
```

---

## Self-Review Checklist

After all tasks are complete, verify against the spec:

- [ ] **Migration ran cleanly:** `weeks.season` is a 4-digit year; week numbers reset to 1 per year per league
- [ ] **RPC fix applied:** `recentForm` for cross-year players shows games in correct chronological order (newest first)
- [ ] **`Week.season` everywhere:** TypeScript has no errors; existing tests updated with `season` field
- [ ] **`deriveSeason` simplified:** Returns season of most recent played week, falls back to current year
- [ ] **`getNextWeekNumber` year-scoped:** Returns 1 when a new year starts
- [ ] **`computeYearStats` tested:** All 8 test cases pass
- [ ] **Year dividers appear:** WeekList and PublicMatchList show `YearDivider` between years; first year has anchor
- [ ] **YearJumpNav hidden below lg:** Disappears before the sidebar at intermediate viewports
- [ ] **Progress bar shows current-year week count:** Falls back to previous year when January has no games yet
- [ ] **Year toggle only on multi-year players:** Single-season players have no toggle in their card header
- [ ] **Dropdown animates in on open:** `max-width: 0 → 140px` transition when card expands; hidden when collapsed
- [ ] **Year-filtered stats are correct:** Selecting a year replaces win rate, played, form, results bar; mentality/rating unchanged
