# DNF Share Button + Ratings Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Share button to the DNF card with team ratings in the share text, and fix the migration that wipes team ratings when DNF is recorded.

**Architecture:** Three coordinated changes — a new SQL migration that updates `record_result` and `edit_week` to preserve `team_a_rating`/`team_b_rating` for DNF; a new `buildDnfShareText` utility in `lib/utils.ts` that mirrors `buildShareText` with a DNF headline; and a Share button in `DnfCard` (`components/MatchCard.tsx`) wired up by widening `WeekList`'s most-recent-week computation to include DNF weeks.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind, Supabase (Postgres + RPCs), Jest.

**Spec:** `docs/superpowers/specs/2026-04-27-dnf-share-design.md`

---

## File structure

| File | Purpose | Action |
|---|---|---|
| `supabase/migrations/20260427000002_dnf_preserve_ratings.sql` | New migration — `CREATE OR REPLACE` `record_result` + `edit_week` to preserve `team_a_rating`/`team_b_rating` for DNF | Create |
| `lib/utils.ts` | Add `buildDnfShareText()` | Modify |
| `lib/__tests__/utils.winCopy.test.ts` | Add unit tests for `buildDnfShareText` | Modify |
| `components/MatchCard.tsx` | Add `leagueName` / `leagueSlug` props to `DnfCard`, add Share button + handler, thread props through `MatchCard` wrapper | Modify |
| `components/WeekList.tsx` | Widen `mostRecent` to include `dnf` weeks | Modify |

---

## Task 1: Add migration to preserve ratings on DNF

**Files:**
- Create: `supabase/migrations/20260427000002_dnf_preserve_ratings.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260427000002_dnf_preserve_ratings.sql` with the following content. The two `CREATE OR REPLACE FUNCTION` statements are identical to the ones in `20260427000001_dnf_status.sql` except the DNF branches no longer null `team_a_rating` / `team_b_rating`:

```sql
-- supabase/migrations/20260427000002_dnf_preserve_ratings.sql
--
-- Updates record_result and edit_week so DNF preserves team_a_rating and
-- team_b_rating, matching the existing intent to preserve lineups for DNF.
-- Already-recorded DNF rows have NULL ratings; this migration does not
-- backfill them — those rows display without ratings until manually edited.

-- 1. Replace record_result RPC
CREATE OR REPLACE FUNCTION record_result(
  p_week_id         UUID,
  p_winner          TEXT,
  p_notes           TEXT         DEFAULT NULL,
  p_goal_difference INTEGER      DEFAULT NULL,
  p_team_a_rating   NUMERIC(6,3) DEFAULT NULL,
  p_team_b_rating   NUMERIC(6,3) DEFAULT NULL,
  p_dnf             BOOLEAN      DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game_id UUID;
BEGIN
  SELECT game_id INTO v_game_id FROM weeks WHERE id = p_week_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Week not found'; END IF;

  IF NOT can_do_match_entry(v_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_dnf THEN
    UPDATE weeks
    SET status          = 'dnf',
        winner          = NULL,
        notes           = p_notes,
        goal_difference = NULL
    WHERE id = p_week_id;

    -- Upsert all players from this match into player_attributes.
    -- Participants are real league members either way (played or dnf).
    INSERT INTO player_attributes (game_id, name)
    SELECT v_game_id, player_name
    FROM (
      SELECT jsonb_array_elements_text(team_a) AS player_name FROM weeks WHERE id = p_week_id
      UNION
      SELECT jsonb_array_elements_text(team_b) AS player_name FROM weeks WHERE id = p_week_id
    ) players
    ON CONFLICT (game_id, name) DO NOTHING;
  ELSE
    UPDATE weeks
    SET status           = 'played',
        winner           = p_winner,
        notes            = p_notes,
        goal_difference  = p_goal_difference,
        team_a_rating    = p_team_a_rating,
        team_b_rating    = p_team_b_rating
    WHERE id = p_week_id;

    -- Upsert all players from this match into player_attributes.
    -- ON CONFLICT DO NOTHING preserves existing eye test ratings and mentalities.
    INSERT INTO player_attributes (game_id, name)
    SELECT v_game_id, player_name
    FROM (
      SELECT jsonb_array_elements_text(team_a) AS player_name FROM weeks WHERE id = p_week_id
      UNION
      SELECT jsonb_array_elements_text(team_b) AS player_name FROM weeks WHERE id = p_week_id
    ) players
    ON CONFLICT (game_id, name) DO NOTHING;
  END IF;
END;
$$;

-- 2. Replace edit_week RPC
CREATE OR REPLACE FUNCTION edit_week(
  p_week_id         UUID,
  p_date            TEXT,
  p_status          TEXT,
  p_winner          TEXT    DEFAULT NULL,
  p_notes           TEXT    DEFAULT NULL,
  p_goal_difference INTEGER DEFAULT NULL,
  p_team_a          JSONB   DEFAULT NULL,
  p_team_b          JSONB   DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game_id UUID;
BEGIN
  SELECT game_id INTO v_game_id FROM weeks WHERE id = p_week_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Week not found'; END IF;

  IF NOT is_game_admin(v_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_status NOT IN ('played', 'cancelled', 'unrecorded', 'dnf') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be played, cancelled, unrecorded, or dnf', p_status;
  END IF;

  IF p_status = 'played' THEN
    UPDATE weeks
    SET date            = p_date,
        status          = 'played',
        winner          = p_winner,
        notes           = p_notes,
        goal_difference = p_goal_difference,
        team_a          = COALESCE(p_team_a, '[]'::jsonb),
        team_b          = COALESCE(p_team_b, '[]'::jsonb),
        team_a_rating   = NULL,
        team_b_rating   = NULL
    WHERE id = p_week_id;
  ELSIF p_status = 'dnf' THEN
    -- Preserve lineups AND ratings (use incoming value or keep existing), clear result fields
    UPDATE weeks
    SET date            = p_date,
        status          = 'dnf',
        winner          = NULL,
        notes           = p_notes,
        goal_difference = NULL,
        team_a          = COALESCE(p_team_a, team_a),
        team_b          = COALESCE(p_team_b, team_b)
    WHERE id = p_week_id;
  ELSE
    UPDATE weeks
    SET date            = p_date,
        status          = p_status,
        winner          = NULL,
        notes           = p_notes,
        goal_difference = NULL,
        team_a          = '[]'::jsonb,
        team_b          = '[]'::jsonb,
        team_a_rating   = NULL,
        team_b_rating   = NULL
    WHERE id = p_week_id;
  END IF;
END;
$$;
```

Key differences from the previous migration (`20260427000001_dnf_status.sql`):
- `record_result` p_dnf=true branch: removed the two lines `team_a_rating = NULL,` and `team_b_rating = NULL`.
- `edit_week` p_status='dnf' branch: removed the two lines `team_a_rating = NULL,` and `team_b_rating = NULL`.
- Other branches (played, cancelled, unrecorded) are unchanged — they still null ratings, which matches existing behaviour.
- No `DROP FUNCTION` needed (signatures are unchanged).
- No `GRANT EXECUTE` needed (grants from the previous migration carry over since the function signature is identical).

- [ ] **Step 2: Verify migration syntax with psql parse check**

This codebase runs migrations via the Supabase SQL Editor (per `CLAUDE.md` repository structure note: "SQL migrations — run in order via Supabase SQL Editor"). There is no local migration runner to invoke. Verify the file parses cleanly by reading it back and comparing structure to the previous migration:

Run: `diff <(grep -E '^(CREATE OR REPLACE FUNCTION|DECLARE|BEGIN|END;|IF|ELSIF|ELSE|UPDATE|SET|WHERE|RAISE)' supabase/migrations/20260427000001_dnf_status.sql) <(grep -E '^(CREATE OR REPLACE FUNCTION|DECLARE|BEGIN|END;|IF|ELSIF|ELSE|UPDATE|SET|WHERE|RAISE)' supabase/migrations/20260427000002_dnf_preserve_ratings.sql)`

Expected: differences appear only in the `team_a_rating = NULL` / `team_b_rating = NULL` lines being removed from the DNF branches, and the absence of `DROP FUNCTION` / `ALTER TABLE` / `GRANT` statements at the start/end. Inspect output by eye — no automated assertion here.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260427000002_dnf_preserve_ratings.sql
git commit -m "fix: preserve team ratings when recording DNF

Previously record_result(p_dnf=true) and edit_week(p_status='dnf')
nulled team_a_rating and team_b_rating, inconsistent with their
preservation of team_a/team_b lineups. The DnfCard UI already
wires the rating values to TeamList; this migration provides
the data."
```

---

## Task 2: Add `buildDnfShareText` utility (TDD)

**Files:**
- Modify: `lib/__tests__/utils.winCopy.test.ts`
- Modify: `lib/utils.ts`

- [ ] **Step 1: Write the failing tests**

Append to `lib/__tests__/utils.winCopy.test.ts`. The first import line currently reads:
```ts
import { winCopy, buildShareText, buildResultShareText } from '../utils'
```
Update to:
```ts
import { winCopy, buildShareText, buildResultShareText, buildDnfShareText } from '../utils'
```

Add a new `describe` block at the bottom of the file (before any trailing closing brace, but each `describe` is top-level — append at end of file):

```ts
describe('buildDnfShareText', () => {
  const baseParams = {
    leagueName: 'Test League',
    leagueSlug: 'test-league',
    week: 5,
    date: '27 Apr 2026', // Monday
    format: '6-a-side',
    teamA: ['Alice', 'Bob', 'Carol'],
    teamB: ['Dave', 'Eve', 'Frank'],
    teamARating: 3.4,
    teamBRating: 3.2,
    notes: 'Pitch flooded after 30 mins',
  }

  it('produces canonical multi-line message with notes and ratings', () => {
    const text = buildDnfShareText(baseParams)
    expect(text).toBe(
      [
        '⚽ Test League — Week 5',
        '📅 Mon 27 Apr · 6-a-side',
        '',
        '⚠️ Game called off — DNF',
        '',
        '🔵 Team A (3.4)',
        'Alice, Bob, Carol',
        '',
        '🟣 Team B (3.2)',
        'Dave, Eve, Frank',
        '',
        'Pitch flooded after 30 mins',
        '',
        '🔗 https://craft-football.com/test-league',
      ].join('\n'),
    )
  })

  it('omits notes paragraph when notes is empty string', () => {
    const text = buildDnfShareText({ ...baseParams, notes: '' })
    expect(text).not.toContain('Pitch flooded')
    expect(text).toBe(
      [
        '⚽ Test League — Week 5',
        '📅 Mon 27 Apr · 6-a-side',
        '',
        '⚠️ Game called off — DNF',
        '',
        '🔵 Team A (3.4)',
        'Alice, Bob, Carol',
        '',
        '🟣 Team B (3.2)',
        'Dave, Eve, Frank',
        '',
        '🔗 https://craft-football.com/test-league',
      ].join('\n'),
    )
  })

  it('omits notes paragraph when notes is whitespace-only', () => {
    const text = buildDnfShareText({ ...baseParams, notes: '   \n  ' })
    expect(text).not.toMatch(/\n {3}\n/)
  })

  it('omits format segment when format is empty string', () => {
    const text = buildDnfShareText({ ...baseParams, format: '' })
    expect(text).toContain('📅 Mon 27 Apr\n')
    expect(text).not.toContain(' · ')
  })

  it('omits team rating parentheticals when ratings are null', () => {
    const text = buildDnfShareText({ ...baseParams, teamARating: null, teamBRating: null })
    expect(text).toContain('🔵 Team A\n')
    expect(text).toContain('🟣 Team B\n')
    expect(text).not.toContain('(3.4)')
    expect(text).not.toContain('(3.2)')
  })

  it('still includes Team A rating when only Team B is null', () => {
    const text = buildDnfShareText({ ...baseParams, teamBRating: null })
    expect(text).toContain('🔵 Team A (3.4)')
    expect(text).toContain('🟣 Team B\n')
    expect(text).not.toContain('(3.2)')
  })

  it('places a blank line between the date/format line and the DNF headline', () => {
    const text = buildDnfShareText(baseParams)
    expect(text).toContain('📅 Mon 27 Apr · 6-a-side\n\n⚠️ Game called off — DNF')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/__tests__/utils.winCopy.test.ts`
Expected: the new `buildDnfShareText` tests fail (TypeScript or runtime error: `buildDnfShareText is not exported from '../utils'`). Existing `winCopy`, `buildShareText`, `buildResultShareText` tests still pass.

- [ ] **Step 3: Implement `buildDnfShareText`**

Append to `lib/utils.ts` immediately after the existing `buildShareText` function (around line 319). Insert this exact block:

```ts
/**
 * Builds a formatted plain-text share message for a DNF (Did Not Finish) week.
 *
 * Mirrors the lineup-share format but replaces the win-probability copy with a
 * DNF headline. Format segment, rating parentheticals, and the notes paragraph
 * are omitted when the corresponding inputs are empty/null.
 */
export function buildDnfShareText(params: {
  leagueName: string
  leagueSlug: string
  week: number
  date: string                // 'DD MMM YYYY'
  format: string              // '' when absent — function omits the "· {format}" segment
  teamA: string[]
  teamB: string[]
  teamARating: number | null  // null → no parenthetical on Team A header
  teamBRating: number | null  // null → no parenthetical on Team B header
  notes: string               // '' when absent — function omits the notes paragraph
}): string {
  const { leagueName, leagueSlug, week, date, format, teamA, teamB, teamARating, teamBRating, notes } = params
  const parsed = parseWeekDate(date)
  const [dd, mmm] = date.split(' ')
  const shortDate = `${DAY_SHORT[parsed.getDay()]} ${dd} ${mmm}`
  const dateLine = format ? `📅 ${shortDate} · ${format}` : `📅 ${shortDate}`
  const teamAHeader = teamARating !== null
    ? `🔵 Team A (${teamARating.toFixed(1)})`
    : '🔵 Team A'
  const teamBHeader = teamBRating !== null
    ? `🟣 Team B (${teamBRating.toFixed(1)})`
    : '🟣 Team B'
  const trimmedNotes = notes.trim()

  const lines: string[] = [
    `⚽ ${leagueName} — Week ${week}`,
    dateLine,
    '',
    '⚠️ Game called off — DNF',
    '',
    teamAHeader,
    teamA.join(', '),
    '',
    teamBHeader,
    teamB.join(', '),
  ]

  if (trimmedNotes.length > 0) {
    lines.push('', trimmedNotes)
  }

  lines.push('', `🔗 https://craft-football.com/${leagueSlug}`)
  return lines.join('\n')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/__tests__/utils.winCopy.test.ts`
Expected: all `buildDnfShareText` tests pass; existing tests in the file still pass.

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.winCopy.test.ts
git commit -m "feat: add buildDnfShareText utility for DNF share messages"
```

---

## Task 3: Add Share button to `DnfCard`

**Files:**
- Modify: `components/MatchCard.tsx`

- [ ] **Step 1: Update imports in `components/MatchCard.tsx`**

Find the existing import line:
```ts
import { cn, shouldShowMeta, isPastDeadline, buildResultShareText } from '@/lib/utils'
```

Replace with:
```ts
import { cn, shouldShowMeta, isPastDeadline, buildResultShareText, buildDnfShareText } from '@/lib/utils'
```

Icon imports do not need to change — the DnfCard share button uses a text-only label (matching `PlayedCard.tsx`'s share button pattern), not an icon.

- [ ] **Step 2: Extend `DnfCardProps` and `DnfCard` signature**

Find this block (around line 175-184):

```ts
interface DnfCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  isAdmin: boolean
  gameId: string
  allPlayers: Player[]
  onResultSaved: () => void
}
```

Replace with:

```ts
interface DnfCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  isAdmin: boolean
  gameId: string
  allPlayers: Player[]
  onResultSaved: () => void
  leagueName?: string
  leagueSlug?: string
}
```

Find the `function DnfCard(...)` signature (around line 186-194):

```ts
function DnfCard({
  week,
  isOpen,
  onToggle,
  isAdmin,
  gameId,
  allPlayers,
  onResultSaved,
}: DnfCardProps) {
  const [showEditModal, setShowEditModal] = useState(false)
```

Replace with:

```ts
function DnfCard({
  week,
  isOpen,
  onToggle,
  isAdmin,
  gameId,
  allPlayers,
  onResultSaved,
  leagueName,
  leagueSlug,
}: DnfCardProps) {
  const [showEditModal, setShowEditModal] = useState(false)
  const [copied, setCopied] = useState(false)

  const canShare = !!(leagueName && leagueSlug)

  async function handleShare() {
    if (!canShare) return
    const shareText = buildDnfShareText({
      leagueName: leagueName!,
      leagueSlug: leagueSlug!,
      week: week.week,
      date: week.date,
      format: week.format ?? '',
      teamA: week.teamA ?? [],
      teamB: week.teamB ?? [],
      teamARating: week.team_a_rating ?? null,
      teamBRating: week.team_b_rating ?? null,
      notes: week.notes ?? '',
    })
    if (navigator.share && window.innerWidth < 768) {
      try {
        await navigator.share({ text: shareText })
      } catch (err) {
        if (err instanceof DOMException && err.name !== 'AbortError') {
          try {
            await navigator.clipboard.writeText(shareText)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          } catch { /* clipboard unavailable */ }
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareText)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch { /* clipboard unavailable */ }
    }
  }
```

- [ ] **Step 3: Replace the bottom action row to include the Share button**

Find this block inside `DnfCard` (around line 264-268, just before the `</div></Collapsible.Content>` closing):

```ts
                {isAdmin && (
                  <div className="border-t border-slate-700 mt-4 pt-4 flex justify-end">
                    <EditResultButton onClick={() => setShowEditModal(true)} />
                  </div>
                )}
```

Replace with:

```ts
                {(isAdmin || canShare) && (
                  <div className="border-t border-slate-700 mt-4 pt-4 flex justify-end items-center gap-2">
                    {isAdmin && (
                      <EditResultButton onClick={() => setShowEditModal(true)} />
                    )}
                    {canShare && (
                      <button
                        type="button"
                        onClick={handleShare}
                        className="px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-colors"
                      >
                        {copied ? 'Copied!' : 'Share'}
                      </button>
                    )}
                  </div>
                )}
```

The button mirrors the played-card share button visuals exactly: same colours (`bg-sky-600 hover:bg-sky-500`), same text-only label (`Share` / `Copied!`), same `Copied!` feedback timing.

- [ ] **Step 4: Thread `leagueName` and `leagueSlug` through the `MatchCard` wrapper**

Find this block in `MatchCard` (around line 617-629):

```ts
  if (week.status === 'dnf') {
    return (
      <DnfCard
        week={week}
        isOpen={isOpen}
        onToggle={onToggle}
        isAdmin={isAdmin}
        gameId={gameId}
        allPlayers={allPlayers}
        onResultSaved={onResultSaved}
      />
    )
  }
```

Replace with:

```ts
  if (week.status === 'dnf') {
    return (
      <DnfCard
        week={week}
        isOpen={isOpen}
        onToggle={onToggle}
        isAdmin={isAdmin}
        gameId={gameId}
        allPlayers={allPlayers}
        onResultSaved={onResultSaved}
        leagueName={leagueName}
        leagueSlug={leagueSlug}
      />
    )
  }
```

(`leagueName` and `leagueSlug` are already destructured in the wrapper's signature for the played path — no change needed there.)

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: all tests pass except the two pre-existing unrelated failures in `lib/__tests__/email.notifications.test.ts` (`notifyRequesterOfReview › sends approved email` and `… sends declined email`). Verify the failure count and names match this — any *additional* failures need investigation.

- [ ] **Step 7: Commit**

```bash
git add components/MatchCard.tsx
git commit -m "feat: add Share button to DnfCard"
```

---

## Task 4: Widen `mostRecent` in `WeekList` to include DNF weeks

**Files:**
- Modify: `components/WeekList.tsx`

- [ ] **Step 1: Update `mostRecent` computation**

Find this block at the top of the `WeekList` component body (lines 36-38):

```ts
  const playedWeeks = getPlayedWeeks(weeks)
  const mostRecent = sortWeeks(playedWeeks)[0] ?? null
  const [internalOpenWeek, setInternalOpenWeek] = useState<number | null>(mostRecent?.week ?? null)
```

Replace with:

```ts
  const recentEligible = sortWeeks(weeks.filter((w) => w.status === 'played' || w.status === 'dnf'))
  const mostRecent = recentEligible[0] ?? null
  const [internalOpenWeek, setInternalOpenWeek] = useState<number | null>(mostRecent?.week ?? null)
```

The `getPlayedWeeks` import becomes unused — remove `getPlayedWeeks` from the import on line 7. Find:

```ts
import { getPlayedWeeks, getMonthKey, formatMonthYear, sortWeeks } from '@/lib/utils'
```

Replace with:

```ts
import { getMonthKey, formatMonthYear, sortWeeks } from '@/lib/utils'
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: all tests pass except the two pre-existing unrelated failures.

- [ ] **Step 4: Commit**

```bash
git add components/WeekList.tsx
git commit -m "feat: include DNF weeks when picking most-recent for share button"
```

---

## Task 5: Final verification

- [ ] **Step 1: Final TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Final test run**

Run: `npm test`
Expected: 305 passing, 2 failing (pre-existing unrelated email failures), no regressions.

- [ ] **Step 3: Verify build does not regress**

Run: `npm run build`
Expected: build succeeds. (If this is a long-running step, run it last so its output is the final piece of evidence before sign-off.)

- [ ] **Step 4: UI verification (manual)**

This is a UI feature; the unit tests cover share text formatting but not the click handler / Web Share API / clipboard fallback. Have the user verify in the browser:

1. The most recent DNF card shows a Share button next to the Edit button (when admin) or alone (when member/public).
2. Clicking Share on desktop copies the text to clipboard and the button briefly reads "Copied!".
3. Clicking Share on mobile opens the system share sheet with the DNF message text.
4. After running the migration in the Supabase SQL Editor, recording a new DNF and reopening the card shows the team ratings on the lineup. Existing DNFs (recorded before the migration) still show without ratings.

Report back the result of this verification before declaring the work complete.

---

## Spec coverage check

| Spec section | Task |
|---|---|
| Migration: `record_result` preserves DNF ratings | Task 1 |
| Migration: `edit_week` preserves DNF ratings | Task 1 |
| `buildDnfShareText` signature | Task 2, Step 3 |
| Share text format incl. blank line, ratings, format/notes optionality | Task 2, Step 1 (tests) + Step 3 (impl) |
| `DnfCard` Share button visuals + handler | Task 3 |
| `MatchCard` wrapper threading | Task 3, Step 4 |
| `WeekList` most-recent widening | Task 4 |
| Tests for `buildDnfShareText` | Task 2, Step 1 |
| Visibility — most recent only, all tiers | Task 4 (most-recent) + Task 3, Step 4 (tier-agnostic prop threading) |
