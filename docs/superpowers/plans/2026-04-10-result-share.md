# Result Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add result sharing to BootRoom — a rich post-save success panel with highlights, and a persistent share button on every played MatchCard.

**Architecture:** `buildResultShareText()` in `lib/utils.ts` computes the full share text and a `highlightsText` block. `ResultModal` calls it at save time, appends highlights to `notes` before writing to DB, and passes `shareText` back via `onSaved`. `NextMatchCard` renders a new `ResultSuccessPanel` component using that text. Every `PlayedCard` in `MatchCard.tsx` gets a share button for retrospective sharing using stored data only.

**Tech Stack:** TypeScript, Next.js 14 App Router, Supabase, Tailwind CSS, `@radix-ui/react-dialog`, `lucide-react`, Jest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/utils.ts` | Modify | Add `buildResultShareText()` |
| `lib/__tests__/utils.winCopy.test.ts` | Modify | Add tests for `buildResultShareText()` |
| `components/ResultSuccessPanel.tsx` | Create | Post-save success dialog with highlights + share |
| `components/ResultModal.tsx` | Modify | Add `weeks`/`leagueName` props; compute+store highlights on save; update `onSaved` signature |
| `components/NextMatchCard.tsx` | Modify | Add `savedResult` state; render `ResultSuccessPanel` |
| `components/MatchCard.tsx` | Modify | Add `leagueName?`/`gameId?` to `PlayedCard`; share button + updated notes display |
| `components/WeekList.tsx` | Modify | Thread `leagueName`/`gameId` down to `MatchCard` |
| `components/ResultsRefresher.tsx` | Modify | Thread `leagueName` prop |

---

## Task 1: `buildResultShareText()` — tests

**Files:**
- Modify: `lib/__tests__/utils.winCopy.test.ts`

> **Note on `recentForm` direction:** The DB computes `recentForm` with `ORDER BY week DESC`, so **leftmost character = most recent game**. However, this plan uses the full `weeks` array for streak computation (more accurate, handles streaks > 5 games), so `recentForm` is not used for highlights.

- [ ] **Step 1: Write failing tests for `buildResultShareText()`**

Add this entire `describe` block at the bottom of `lib/__tests__/utils.winCopy.test.ts`, after the existing `buildShareText` block:

```ts
import { buildResultShareText } from '../utils'
import type { Player, Week } from '../types'

// ── helpers ──────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<Player> & { name: string }): Player {
  return {
    played: 10,
    won: 5,
    drew: 2,
    lost: 3,
    timesTeamA: 5,
    timesTeamB: 5,
    winRate: 0.5,
    qualified: true,
    points: 17,
    goalkeeper: false,
    mentality: 'balanced',
    rating: 2,
    recentForm: 'WDLWW',
    ...overrides,
  }
}

function makeWeek(overrides: Partial<Week> & { week: number; date: string }): Week {
  return {
    status: 'played',
    teamA: [],
    teamB: [],
    winner: 'teamA',
    goal_difference: 1,
    ...overrides,
  }
}

const BASE_PARAMS = {
  leagueName: 'The Boot Room',
  leagueId: 'abc123',
  week: 12,
  date: '10 Apr 2026',
  format: '6-a-side',
  teamA: ['Dave', 'Tom'],
  teamB: ['Jordan', 'Lee'],
  winner: 'teamA' as const,
  goalDifference: 2,
  teamARating: 4.1,
  teamBRating: 4.8,
  players: [
    makePlayer({ name: 'Dave', played: 10 }),
    makePlayer({ name: 'Tom', played: 10 }),
    makePlayer({ name: 'Jordan', played: 10 }),
    makePlayer({ name: 'Lee', played: 10 }),
  ],
  weeks: [
    makeWeek({ week: 12, date: '10 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA', goal_difference: 2 }),
  ],
}

describe('buildResultShareText', () => {
  // ── result headline ──

  it('includes winner headline for teamA win', () => {
    const { shareText } = buildResultShareText(BASE_PARAMS)
    expect(shareText).toContain('🏆 Team A win! (+2 goals)')
  })

  it('includes winner headline for teamB win', () => {
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, winner: 'teamB', teamARating: 4.8, teamBRating: 4.1 })
    expect(shareText).toContain('🏆 Team B win! (+2 goals)')
  })

  it('shows draw headline with no margin line', () => {
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, winner: 'draw', goalDifference: 0 })
    expect(shareText).toContain('🤝 Draw!')
    expect(shareText).not.toContain('goals)')
  })

  it('includes both team lineups', () => {
    const { shareText } = buildResultShareText(BASE_PARAMS)
    expect(shareText).toContain('Dave, Tom')
    expect(shareText).toContain('Jordan, Lee')
  })

  it('includes the public URL', () => {
    const { shareText } = buildResultShareText(BASE_PARAMS)
    expect(shareText).toContain('https://craft-football.com/abc123')
  })

  // ── upset flag ──

  it('emits upset line when lower-rated team wins', () => {
    // teamB (4.8) > teamA (4.1) but teamA won — upset
    const { shareText } = buildResultShareText(BASE_PARAMS)
    expect(shareText).toContain('😱 Upset!')
  })

  it('does not emit upset line when higher-rated team wins', () => {
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, teamARating: 4.8, teamBRating: 4.1 })
    expect(shareText).not.toContain('😱')
  })

  it('does not emit upset line when ratings are equal', () => {
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, teamARating: 4.0, teamBRating: 4.0 })
    expect(shareText).not.toContain('😱')
  })

  it('does not emit upset line on a draw', () => {
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, winner: 'draw', teamARating: 4.1, teamBRating: 4.8, goalDifference: 0 })
    expect(shareText).not.toContain('😱')
  })

  // ── win streak ──

  it('emits win streak line at exactly 3 games', () => {
    // Dave won last 2 games + wins tonight = streak of 3
    const weeks = [
      makeWeek({ week: 10, date: '27 Mar 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA' }),
      makeWeek({ week: 11, date: '03 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA' }),
      makeWeek({ week: 12, date: '10 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA', goal_difference: 2 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, weeks })
    expect(shareText).toContain('🔥 Dave on a 3-game winning streak')
  })

  it('does not emit win streak line at 2 games', () => {
    // Dave won last 1 game + wins tonight = streak of 2
    const weeks = [
      makeWeek({ week: 11, date: '03 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA' }),
      makeWeek({ week: 12, date: '10 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA', goal_difference: 2 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, weeks })
    expect(shareText).not.toContain('winning streak')
  })

  it('does not emit win streak for a draw', () => {
    const weeks = [
      makeWeek({ week: 10, date: '27 Mar 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA' }),
      makeWeek({ week: 11, date: '03 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA' }),
      makeWeek({ week: 12, date: '10 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'draw', goal_difference: 0 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, winner: 'draw', goalDifference: 0, weeks })
    expect(shareText).not.toContain('winning streak')
  })

  // ── unbeaten streak broken ──

  it('emits unbeaten streak broken at exactly 5 games', () => {
    // Jordan unbeaten for 5 then loses tonight (Jordan is on teamB, teamA wins)
    const weeks = [
      makeWeek({ week: 7,  date: '13 Mar 2026', teamA: ['Dave'], teamB: ['Jordan'], winner: 'teamB' }),
      makeWeek({ week: 8,  date: '20 Mar 2026', teamA: ['Jordan'], teamB: ['Dave'],  winner: 'teamA' }),
      makeWeek({ week: 9,  date: '27 Mar 2026', teamA: ['Jordan'], teamB: ['Dave'],  winner: 'draw' }),
      makeWeek({ week: 10, date: '03 Apr 2026', teamA: ['Jordan'], teamB: ['Dave'],  winner: 'teamA' }),
      makeWeek({ week: 11, date: '07 Apr 2026', teamA: ['Jordan'], teamB: ['Dave'],  winner: 'teamA' }),
      makeWeek({ week: 12, date: '10 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA', goal_difference: 2 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, weeks })
    expect(shareText).toContain("💔 Jordan")
    expect(shareText).toContain("5-game unbeaten run is over")
  })

  it('does not emit unbeaten streak broken at 4 games', () => {
    const weeks = [
      makeWeek({ week: 8,  date: '20 Mar 2026', teamA: ['Jordan'], teamB: ['Dave'],  winner: 'teamA' }),
      makeWeek({ week: 9,  date: '27 Mar 2026', teamA: ['Jordan'], teamB: ['Dave'],  winner: 'draw' }),
      makeWeek({ week: 10, date: '03 Apr 2026', teamA: ['Jordan'], teamB: ['Dave'],  winner: 'teamA' }),
      makeWeek({ week: 11, date: '07 Apr 2026', teamA: ['Jordan'], teamB: ['Dave'],  winner: 'teamA' }),
      makeWeek({ week: 12, date: '10 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA', goal_difference: 2 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, weeks })
    expect(shareText).not.toContain('unbeaten run is over')
  })

  // ── milestones ──

  it('emits milestone at exactly 10 games', () => {
    const players = [
      makePlayer({ name: 'Dave', played: 9 }),
      makePlayer({ name: 'Tom', played: 10 }),
      makePlayer({ name: 'Jordan', played: 10 }),
      makePlayer({ name: 'Lee', played: 10 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, players })
    expect(shareText).toContain('🎖️ Dave played their 10th game tonight')
  })

  it('does not emit milestone at 9 games', () => {
    const players = [
      makePlayer({ name: 'Dave', played: 8 }),
      makePlayer({ name: 'Tom', played: 10 }),
      makePlayer({ name: 'Jordan', played: 10 }),
      makePlayer({ name: 'Lee', played: 10 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, players })
    expect(shareText).not.toContain('🎖️ Dave')
  })

  it('emits milestone at 25 games', () => {
    const players = [
      makePlayer({ name: 'Dave', played: 24 }),
      makePlayer({ name: 'Tom', played: 10 }),
      makePlayer({ name: 'Jordan', played: 10 }),
      makePlayer({ name: 'Lee', played: 10 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, players })
    expect(shareText).toContain('🎖️ Dave played their 25th game tonight')
  })

  it('emits milestone at 50 games', () => {
    const players = [
      makePlayer({ name: 'Dave', played: 49 }),
      makePlayer({ name: 'Tom', played: 10 }),
      makePlayer({ name: 'Jordan', played: 10 }),
      makePlayer({ name: 'Lee', played: 10 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, players })
    expect(shareText).toContain('🎖️ Dave played their 50th game tonight')
  })

  it('does not emit milestone at 49 games', () => {
    const players = [
      makePlayer({ name: 'Dave', played: 48 }),
      makePlayer({ name: 'Tom', played: 10 }),
      makePlayer({ name: 'Jordan', played: 10 }),
      makePlayer({ name: 'Lee', played: 10 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, players })
    expect(shareText).not.toContain('🎖️ Dave')
  })

  it('emits milestone at 100 games', () => {
    const players = [
      makePlayer({ name: 'Dave', played: 99 }),
      makePlayer({ name: 'Tom', played: 10 }),
      makePlayer({ name: 'Jordan', played: 10 }),
      makePlayer({ name: 'Lee', played: 10 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, players })
    expect(shareText).toContain('🎖️ Dave played their 100th game tonight')
  })

  it('does not emit milestone at 51 games', () => {
    const players = [
      makePlayer({ name: 'Dave', played: 50 }),
      makePlayer({ name: 'Tom', played: 10 }),
      makePlayer({ name: 'Jordan', played: 10 }),
      makePlayer({ name: 'Lee', played: 10 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, players })
    expect(shareText).not.toContain('🎖️ Dave')
  })

  // ── quarter table ──

  it('always includes Q standings with top 5', () => {
    const players = Array.from({ length: 6 }, (_, i) =>
      makePlayer({ name: `Player${i}`, played: 10, points: 20 - i })
    )
    const weeks = Array.from({ length: 6 }, (_, i) =>
      makeWeek({
        week: i + 1,
        date: '10 Apr 2026',
        teamA: ['Player0', 'Player1', 'Player2'],
        teamB: ['Player3', 'Player4', 'Player5'],
        winner: 'teamA',
      })
    )
    // Use a simple setup where computeQuarterlyTable will return entries
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, players, weeks })
    expect(shareText).toContain('📊')
    expect(shareText).toContain('standings')
  })

  // ── highlightsText ──

  it('returns non-empty highlightsText when highlights exist', () => {
    const weeks = [
      makeWeek({ week: 10, date: '27 Mar 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA' }),
      makeWeek({ week: 11, date: '03 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA' }),
      makeWeek({ week: 12, date: '10 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA', goal_difference: 2 }),
    ]
    const { highlightsText } = buildResultShareText({ ...BASE_PARAMS, weeks })
    expect(highlightsText.length).toBeGreaterThan(0)
    expect(highlightsText).toContain('🔥')
  })

  it('returns empty highlightsText when no highlights fired', () => {
    // No streaks, equal ratings (no upset), no milestones, single game
    const players = [
      makePlayer({ name: 'Dave', played: 10 }),
      makePlayer({ name: 'Tom', played: 10 }),
      makePlayer({ name: 'Jordan', played: 10 }),
      makePlayer({ name: 'Lee', played: 10 }),
    ]
    const weeks = [
      makeWeek({ week: 12, date: '10 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA', goal_difference: 1 }),
    ]
    const { highlightsText } = buildResultShareText({
      ...BASE_PARAMS,
      teamARating: 4.0,
      teamBRating: 4.0,
      players,
      weeks,
    })
    // Only the table and possibly in-form, but no 🔥 💔 😱 🎖️ lines
    expect(highlightsText).not.toContain('🔥')
    expect(highlightsText).not.toContain('💔')
    expect(highlightsText).not.toContain('😱')
    expect(highlightsText).not.toContain('🎖️')
  })
})
```

- [ ] **Step 2: Run tests to confirm they all fail**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/quebec
npx jest utils.winCopy --no-coverage 2>&1 | tail -20
```

Expected: multiple failures including `buildResultShareText is not a function`.

---

## Task 2: `buildResultShareText()` — implementation

**Files:**
- Modify: `lib/utils.ts`

- [ ] **Step 1: Add the import for sidebar-stats at the top of `lib/utils.ts`**

Find the existing imports at the top of `lib/utils.ts`. Add:

```ts
import { computeQuarterlyTable, computeInForm } from '@/lib/sidebar-stats'
```

> **Important:** `lib/sidebar-stats.ts` already imports from `lib/utils.ts` (`parseWeekDate`). Check for circular dependency. If Jest fails with a circular import error, move the streak helper functions used by `buildResultShareText` into `lib/utils.ts` inline rather than importing from `sidebar-stats` — the `computeQuarterlyTable` and `computeInForm` functions will need to be either moved or the call inlined. In practice, the circular dependency is runtime-safe in Next.js but may cause issues in Jest; if so, inline the table/form logic or use a lazy import pattern.

- [ ] **Step 2: Add `buildResultShareText()` to `lib/utils.ts`**

Add this function after the existing `buildShareText` function (around line 203):

```ts
const MILESTONE_SET = new Set([10, 25])
function isMilestone(n: number): boolean {
  if (MILESTONE_SET.has(n)) return true
  return n >= 50 && n % 50 === 0
}

function ordinal(n: number): string {
  const s = ['th','st','nd','rd']
  const v = n % 100
  return n + (s[(v-20)%10] ?? s[v] ?? s[0])
}

function currentWinStreak(playerName: string, weeks: Week[]): number {
  const played = weeks
    .filter(w => w.status === 'played' && (w.teamA.includes(playerName) || w.teamB.includes(playerName)))
    .sort((a, b) => parseWeekDate(b.date).getTime() - parseWeekDate(a.date).getTime())
  let count = 0
  for (const w of played) {
    const onTeamA = w.teamA.includes(playerName)
    const won = (w.winner === 'teamA' && onTeamA) || (w.winner === 'teamB' && !onTeamA)
    if (won) count++
    else break
  }
  return count
}

function currentUnbeatenStreak(playerName: string, weeks: Week[]): number {
  const played = weeks
    .filter(w => w.status === 'played' && (w.teamA.includes(playerName) || w.teamB.includes(playerName)))
    .sort((a, b) => parseWeekDate(b.date).getTime() - parseWeekDate(a.date).getTime())
  let count = 0
  for (const w of played) {
    const onTeamA = w.teamA.includes(playerName)
    const lost = (w.winner === 'teamA' && !onTeamA) || (w.winner === 'teamB' && onTeamA)
    if (!lost) count++
    else break
  }
  return count
}

/**
 * Builds a formatted plain-text share message for a saved result.
 * Returns { shareText, highlightsText } — shareText is the full message;
 * highlightsText is just the highlights block for appending to notes.
 */
export function buildResultShareText(params: {
  leagueName: string
  leagueId: string
  week: number
  date: string           // 'DD MMM YYYY'
  format: string
  teamA: string[]
  teamB: string[]
  winner: Winner
  goalDifference: number
  teamARating: number
  teamBRating: number
  players: Player[]
  weeks: Week[]          // includes the synthetic week for tonight
}): { shareText: string; highlightsText: string } {
  const {
    leagueName, leagueId, week, date, format,
    teamA, teamB, winner, goalDifference,
    teamARating, teamBRating, players, weeks,
  } = params

  const parsed = parseWeekDate(date)
  const [dd, mmm] = date.split(' ')
  const shortDate = `${DAY_SHORT[parsed.getDay()]} ${dd} ${mmm}`

  // ── Result headline ──────────────────────────────────────────────────────
  const resultLine =
    winner === 'draw'
      ? '🤝 Draw!'
      : winner === 'teamA'
        ? `🏆 Team A win! (+${goalDifference} goals)`
        : `🏆 Team B win! (+${goalDifference} goals)`

  // ── Highlights ───────────────────────────────────────────────────────────
  const highlights: string[] = []

  // Win streaks (winning team only)
  if (winner !== 'draw') {
    const winners = winner === 'teamA' ? teamA : teamB
    for (const name of winners) {
      const streak = currentWinStreak(name, weeks)
      if (streak >= 3) {
        highlights.push(`🔥 ${name} on a ${streak}-game winning streak`)
      }
    }
  }

  // Unbeaten streaks broken (losing team only, non-draw)
  if (winner !== 'draw') {
    const losers = winner === 'teamA' ? teamB : teamA
    // Compute streak from weeks BEFORE tonight (exclude last entry which is tonight)
    const priorWeeks = weeks.slice(0, -1)
    for (const name of losers) {
      const streak = currentUnbeatenStreak(name, priorWeeks)
      if (streak >= 5) {
        highlights.push(`💔 ${name}'s ${streak}-game unbeaten run is over`)
      }
    }
  }

  // Upset flag
  if (winner !== 'draw') {
    const upset =
      (winner === 'teamA' && teamBRating > teamARating) ||
      (winner === 'teamB' && teamARating > teamBRating)
    if (upset) {
      const [strongRating, weakRating] =
        winner === 'teamA'
          ? [teamBRating.toFixed(1), teamARating.toFixed(1)]
          : [teamARating.toFixed(1), teamBRating.toFixed(1)]
      const strongTeam = winner === 'teamA' ? 'Team B' : 'Team A'
      highlights.push(`😱 Upset! ${strongTeam} were stronger on paper (${strongRating} vs ${weakRating})`)
    }
  }

  // Milestones
  const allPlayers = [...teamA, ...teamB]
  for (const name of allPlayers) {
    const player = players.find(p => p.name === name)
    if (!player) continue
    const newPlayed = player.played + 1
    if (isMilestone(newPlayed)) {
      highlights.push(`🎖️ ${name} played their ${ordinal(newPlayed)} game tonight`)
    }
  }

  // ── Quarter table top 5 ──────────────────────────────────────────────────
  const tableLines: string[] = []
  try {
    const { quarterLabel, entries } = computeQuarterlyTable(weeks)
    if (entries.length > 0) {
      tableLines.push(`📊 ${quarterLabel} standings`)
      entries.slice(0, 5).forEach((e, i) => {
        tableLines.push(`${i + 1}. ${e.name} — ${e.points}pts`)
      })
    }
  } catch {
    // If computeQuarterlyTable fails (e.g. empty weeks), skip table section
  }

  // ── In-form ──────────────────────────────────────────────────────────────
  const inFormLines: string[] = []
  try {
    const tonight = new Set([...teamA, ...teamB])
    const inForm = computeInForm(players, weeks)
      .filter(e => tonight.has(e.name) && e.ppg >= 1.5)
    if (inForm.length > 0) {
      const top = inForm[0]
      inFormLines.push(`⚡ In form: ${top.name} (${top.ppg.toFixed(1)} PPG)`)
    }
  } catch {
    // skip on error
  }

  // ── Assemble highlightsText (no header, no teams, no URL) ────────────────
  const highlightParts: string[] = []
  if (highlights.length > 0) highlightParts.push(highlights.join('\n'))
  if (tableLines.length > 0) highlightParts.push(tableLines.join('\n'))
  if (inFormLines.length > 0) highlightParts.push(inFormLines.join('\n'))
  const highlightsText = highlightParts.join('\n\n')

  // ── Assemble full shareText ──────────────────────────────────────────────
  const parts: string[] = [
    `⚽ ${leagueName} — Week ${week}`,
    `📅 ${shortDate} · ${format}`,
    '',
    resultLine,
    '',
    '🔵 Team A',
    teamA.join(', '),
    '',
    '🟣 Team B',
    teamB.join(', '),
  ]

  if (highlightsText.length > 0) {
    parts.push('')
    parts.push(highlightsText)
  }

  parts.push('')
  parts.push(`🔗 https://craft-football.com/${leagueId}`)

  return { shareText: parts.join('\n'), highlightsText }
}
```

- [ ] **Step 3: Fix circular import if it occurs**

Run the tests first. If you see a circular dependency error, remove the import of `computeQuarterlyTable` and `computeInForm` from `lib/sidebar-stats` and instead copy the minimal logic inline into `buildResultShareText`. The `computeQuarterlyTable` call can be replaced with:

```ts
// Inline minimal quarterly table (top 5 for current quarter)
const now = new Date()
const q = Math.floor(now.getMonth() / 3) + 1
const year = now.getFullYear()
const qWeeks = weeks.filter(w => {
  if (w.status !== 'played') return false
  const d = parseWeekDate(w.date)
  const wq = Math.floor(d.getMonth() / 3) + 1
  return wq === q && d.getFullYear() === year
})
const tableMap = new Map<string, number>()
for (const w of qWeeks) {
  for (const name of [...w.teamA, ...w.teamB]) {
    const prev = tableMap.get(name) ?? 0
    const onTeamA = w.teamA.includes(name)
    const pts = w.winner === 'draw' ? 1
      : (w.winner === 'teamA' && onTeamA) || (w.winner === 'teamB' && !onTeamA) ? 3 : 0
    tableMap.set(name, prev + pts)
  }
}
const tableEntries = Array.from(tableMap.entries())
  .sort(([,a],[,b]) => b - a)
  .slice(0, 5)
```

And the `computeInForm` call can be replaced with a PPG computation over `recentForm`:

```ts
// Inline in-form: PPG from recentForm for players who played tonight
const tonight = new Set([...teamA, ...teamB])
const inFormEntries = players
  .filter(p => tonight.has(p.name) && p.played >= 5)
  .map(p => {
    const chars = p.recentForm.split('').filter(c => c !== '-')
    if (chars.length === 0) return { name: p.name, ppg: 0 }
    const pts = chars.reduce((acc, c) => acc + (c === 'W' ? 3 : c === 'D' ? 1 : 0), 0)
    return { name: p.name, ppg: pts / chars.length }
  })
  .filter(e => e.ppg >= 1.5)
  .sort((a, b) => b.ppg - a.ppg)
```

- [ ] **Step 4: Run tests — all must pass**

```bash
npx jest utils.winCopy --no-coverage 2>&1 | tail -30
```

Expected: all tests pass (the existing `winCopy` and `buildShareText` tests plus the new ones).

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.winCopy.test.ts
git commit -m "feat: add buildResultShareText() with streak, upset, milestone, table highlights"
```

---

## Task 3: `ResultSuccessPanel` — new component

**Files:**
- Create: `components/ResultSuccessPanel.tsx`

- [ ] **Step 1: Create `components/ResultSuccessPanel.tsx`**

```tsx
'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Share2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Winner } from '@/lib/types'

interface Props {
  week: number
  date: string
  winner: Winner
  goalDifference: number
  teamA: string[]
  teamB: string[]
  highlightsText: string
  shareText: string
  onDismiss: () => void
}

export function ResultSuccessPanel({
  week,
  date,
  winner,
  goalDifference,
  teamA,
  teamB,
  highlightsText,
  shareText,
  onDismiss,
}: Props) {
  const [copied, setCopied] = useState(false)

  const resultHeadline =
    winner === 'draw'
      ? '🤝 Draw!'
      : winner === 'teamA'
        ? `🏆 Team A win! (+${goalDifference} goals)`
        : `🏆 Team B win! (+${goalDifference} goals)`

  const highlightLines = highlightsText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  async function handleShare() {
    if (navigator.share && window.innerWidth < 768) {
      try {
        await navigator.share({ text: shareText })
      } catch (err) {
        if (err instanceof DOMException && err.name !== 'AbortError') {
          await copyToClipboard()
        }
      }
    } else {
      await copyToClipboard()
    }
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable — nothing to do
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onDismiss() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 z-[999]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] w-full max-w-sm rounded-xl bg-slate-800 border border-slate-700 shadow-xl focus:outline-none overflow-hidden">

          {/* Header */}
          <div className="px-5 pt-4 pb-3 border-b border-slate-700 flex items-center justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold text-slate-100">
                Result saved — Week {week}
              </Dialog.Title>
              <Dialog.Description className="text-xs text-slate-400 mt-0.5">
                {date}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="text-slate-500 hover:text-slate-300 p-1 rounded transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="p-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">

            {/* Result headline */}
            <div className={cn(
              'rounded-lg border px-4 py-3 text-center',
              winner === 'teamA' ? 'bg-blue-950 border-blue-800' :
              winner === 'teamB' ? 'bg-violet-950 border-violet-800' :
              'bg-slate-900 border-slate-700'
            )}>
              <p className={cn(
                'text-base font-bold',
                winner === 'teamA' ? 'text-blue-300' :
                winner === 'teamB' ? 'text-violet-300' :
                'text-slate-300'
              )}>
                {resultHeadline}
              </p>
            </div>

            {/* Teams */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900 border border-blue-900/50 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide mb-2">🔵 Team A</p>
                <p className="text-xs text-slate-300 leading-relaxed">{teamA.join(', ')}</p>
              </div>
              <div className="bg-slate-900 border border-violet-900/50 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide mb-2">🟣 Team B</p>
                <p className="text-xs text-slate-300 leading-relaxed">{teamB.join(', ')}</p>
              </div>
            </div>

            {/* Highlights */}
            {highlightLines.length > 0 && (
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Highlights</p>
                <div className="flex flex-col gap-1.5">
                  {highlightLines.map((line, i) => (
                    <p key={i} className="text-xs text-slate-300">{line}</p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex gap-2 px-5 pb-5 pt-2">
            <button
              type="button"
              onClick={handleShare}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
            >
              <Share2 className="h-4 w-4" />
              {copied ? 'Result copied!' : 'Share result'}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="px-4 py-2.5 rounded-lg border border-slate-600 text-slate-300 text-sm hover:border-slate-500 transition-colors"
            >
              Done
            </button>
          </div>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep ResultSuccessPanel
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add components/ResultSuccessPanel.tsx
git commit -m "feat: add ResultSuccessPanel component"
```

---

## Task 4: `ResultModal` — add weeks/leagueName, compute highlights on save

**Files:**
- Modify: `components/ResultModal.tsx`

- [ ] **Step 1: Update `ResultModal` Props interface**

Find the `interface Props` block (around line 12) and update it:

```ts
interface Props {
  scheduledWeek: ScheduledWeek
  lineupMetadata: LineupMetadata | null
  allPlayers: Player[]
  gameId: string
  leagueName: string        // new
  weeks: Week[]             // new
  publicMode: boolean
  onSaved: (result: { winner: Winner; goalDifference: number; shareText: string; highlightsText: string }) => void
  onClose: () => void
}
```

Update the destructuring in `ResultModal` function signature:

```ts
export function ResultModal({ scheduledWeek, lineupMetadata, allPlayers, gameId, leagueName, weeks, publicMode, onSaved, onClose }: Props) {
```

- [ ] **Step 2: Add `buildResultShareText` import**

At the top of `components/ResultModal.tsx`, find the existing import from `@/lib/utils` and add `buildResultShareText`:

```ts
import { cn, ewptScore, buildResultShareText } from '@/lib/utils'
```

Also add `Week` to the types import:

```ts
import type { Winner, ScheduledWeek, LineupMetadata, Player, Mentality, Week } from '@/lib/types'
```

- [ ] **Step 3: Update `handleSave` to compute highlights and combine notes**

In the `handleSave` function, after computing `teamAScore` and `teamBScore` (around line 186), and before the `try` block, add:

```ts
// Construct a synthetic week for the result just being saved so highlights
// include tonight's game in streak / table computations.
const syntheticWeek: Week = {
  week: scheduledWeek.week,
  date: scheduledWeek.date,
  status: 'played',
  format: scheduledWeek.format ?? undefined,
  teamA: scheduledWeek.teamA,
  teamB: scheduledWeek.teamB,
  winner,
  goal_difference: winner === 'draw' ? 0 : goalDifference,
  team_a_rating: teamAScore,
  team_b_rating: teamBScore,
}
const weeksWithResult = [...weeks, syntheticWeek]

const { shareText, highlightsText } = buildResultShareText({
  leagueName,
  leagueId: gameId,
  week: scheduledWeek.week,
  date: scheduledWeek.date,
  format: scheduledWeek.format ?? '',
  teamA: scheduledWeek.teamA,
  teamB: scheduledWeek.teamB,
  winner,
  goalDifference: winner === 'draw' ? 0 : goalDifference,
  teamARating: teamAScore,
  teamBRating: teamBScore,
  players: allPlayers,
  weeks: weeksWithResult,
})

const combinedNotes = notes.trim()
  ? notes.trim() + '\n\n' + highlightsText
  : highlightsText
```

- [ ] **Step 4: Update the DB writes to use `combinedNotes`**

In the `try` block, replace `notes: notes.trim() || null` (public mode) and `p_notes: notes.trim() || null` (Supabase RPC) with `combinedNotes || null`:

**Public mode** (find `body: JSON.stringify({` block):
```ts
body: JSON.stringify({
  weekId: scheduledWeek.id,
  winner,
  notes: combinedNotes || null,
  goalDifference: winner === 'draw' ? 0 : goalDifference,
  teamARating: teamAScore,
  teamBRating: teamBScore,
}),
```

**Supabase RPC** (find `supabase.rpc('record_result'`):
```ts
const { error: resultErr } = await supabase.rpc('record_result', {
  p_week_id: scheduledWeek.id,
  p_winner: winner,
  p_notes: combinedNotes || null,
  p_goal_difference: winner === 'draw' ? 0 : goalDifference,
  p_team_a_rating: teamAScore,
  p_team_b_rating: teamBScore,
})
```

- [ ] **Step 5: Update `onSaved` call at the end of `handleSave`**

Find `onSaved()` call inside the `try` block and replace with:

```ts
onSaved({ winner, goalDifference, shareText, highlightsText })
```

- [ ] **Step 6: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep ResultModal
```

Expected: errors about callers passing wrong props to `ResultModal` — we'll fix those in the next task.

- [ ] **Step 7: Commit**

```bash
git add components/ResultModal.tsx
git commit -m "feat: ResultModal computes and stores highlights on save"
```

---

## Task 5: `NextMatchCard` — wire up success panel

**Files:**
- Modify: `components/NextMatchCard.tsx`

- [ ] **Step 1: Add `ResultSuccessPanel` import and `savedResult` state**

At the top of `NextMatchCard.tsx`, add the import:

```ts
import { ResultSuccessPanel } from '@/components/ResultSuccessPanel'
```

In the `NextMatchCard` function body, after the `const [showResultModal, setShowResultModal] = useState(false)` line, add:

```ts
const [savedResult, setSavedResult] = useState<{
  winner: Winner
  goalDifference: number
  shareText: string
  highlightsText: string
} | null>(null)
```

- [ ] **Step 2: Update the `ResultModal` usage**

Find the `<ResultModal` JSX (around line 1023) and update it with the new props and `onSaved` signature:

```tsx
{showResultModal && scheduledWeek && (
  <ResultModal
    scheduledWeek={scheduledWeek}
    lineupMetadata={scheduledWeek.lineupMetadata ?? null}
    allPlayers={allPlayers}
    gameId={gameId}
    leagueName={leagueName ?? ''}
    weeks={weeks}
    publicMode={publicMode}
    onSaved={(result) => {
      setShowResultModal(false)
      setScheduledWeek(null)
      setGuestEntries([])
      setNewPlayerEntries([])
      setCardState('idle')
      setSavedResult(result)
    }}
    onClose={() => setShowResultModal(false)}
  />
)}
```

- [ ] **Step 3: Render `ResultSuccessPanel` when `savedResult` is set**

Add this block immediately after the `ResultModal` block:

```tsx
{savedResult && scheduledWeek && (
  <ResultSuccessPanel
    week={scheduledWeek?.week ?? 0}
    date={scheduledWeek?.date ?? ''}
    winner={savedResult.winner}
    goalDifference={savedResult.goalDifference}
    teamA={scheduledWeek?.teamA ?? []}
    teamB={scheduledWeek?.teamB ?? []}
    highlightsText={savedResult.highlightsText}
    shareText={savedResult.shareText}
    onDismiss={() => {
      setSavedResult(null)
      onResultSaved()
    }}
  />
)}
```

> **Note:** `scheduledWeek` is set to `null` in the `onSaved` handler above. To preserve the team/date data for the success panel, either (a) store them in `savedResult`, or (b) delay clearing `scheduledWeek` until after `ResultSuccessPanel` is dismissed. Approach (b) is simpler — remove `setScheduledWeek(null)` from the `onSaved` handler and move it into the `ResultSuccessPanel.onDismiss` callback:

Update the `onSaved` handler (removing `setScheduledWeek(null)` from it):

```tsx
onSaved={(result) => {
  setShowResultModal(false)
  setGuestEntries([])
  setNewPlayerEntries([])
  setCardState('idle')
  setSavedResult(result)
}}
```

Update `ResultSuccessPanel.onDismiss`:

```tsx
onDismiss={() => {
  setSavedResult(null)
  setScheduledWeek(null)
  onResultSaved()
}}
```

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "NextMatchCard|ResultSuccessPanel|ResultModal"
```

Expected: no errors.

- [ ] **Step 5: Run all tests**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add components/NextMatchCard.tsx
git commit -m "feat: show ResultSuccessPanel after result is saved"
```

---

## Task 6: `MatchCard` — share button + notes display + prop threading

**Files:**
- Modify: `components/MatchCard.tsx`
- Modify: `components/WeekList.tsx`
- Modify: `components/ResultsRefresher.tsx`

### Part A — `MatchCard.tsx`

- [ ] **Step 1: Add `Share2` to lucide imports and add `cn`, `parseWeekDate` imports**

In `components/MatchCard.tsx`, find the existing imports and ensure these are present:

```ts
import { ChevronDown, Pencil, Share2 } from 'lucide-react'
```

Also add `parseWeekDate` to the utils import if not already there:

```ts
import { cn, shouldShowMeta, isPastDeadline, parseWeekDate } from '@/lib/utils'
```

- [ ] **Step 2: Add `leagueName` and `gameId` to `PlayedCardProps`**

Find the `interface PlayedCardProps` block (around line 156) and add two optional props:

```ts
interface PlayedCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  goalkeepers?: string[]
  isAdmin: boolean
  gameId: string
  allPlayers: Player[]
  onResultSaved: () => void
  leagueName?: string        // new
  shareGameId?: string       // new — separate from gameId to avoid confusion (gameId drives edit flows)
}
```

> Use `shareGameId` to keep the share prop distinct from the existing `gameId` used for edit/result modals. The value passed will be the same string — this just avoids renaming a widely-used prop.

- [ ] **Step 3: Add `copied` state and share handler to `PlayedCard`**

In the `PlayedCard` function body, after `const [showEditModal, setShowEditModal] = useState(false)`, add:

```ts
const [copied, setCopied] = useState(false)

function buildRetroShareText(): string {
  if (!leagueName || !shareGameId) return ''
  const parsed = parseWeekDate(week.date)
  const [dd, mmm] = week.date.split(' ')
  const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const shortDate = `${DAY_SHORT[parsed.getDay()]} ${dd} ${mmm}`
  const resultLine =
    week.winner === 'draw'
      ? '🤝 Draw!'
      : week.winner === 'teamA'
        ? `🏆 Team A win!${week.goal_difference ? ` (+${week.goal_difference} goals)` : ''}`
        : `🏆 Team B win!${week.goal_difference ? ` (+${week.goal_difference} goals)` : ''}`

  const upset =
    week.winner !== 'draw' &&
    week.team_a_rating != null && week.team_b_rating != null &&
    ((week.winner === 'teamA' && week.team_b_rating > week.team_a_rating) ||
     (week.winner === 'teamB' && week.team_a_rating > week.team_b_rating))

  const upsetLine = upset
    ? `😱 Upset! ${week.winner === 'teamA' ? 'Team B' : 'Team A'} were stronger on paper (${
        week.winner === 'teamA'
          ? `${week.team_b_rating!.toFixed(1)} vs ${week.team_a_rating!.toFixed(1)}`
          : `${week.team_a_rating!.toFixed(1)} vs ${week.team_b_rating!.toFixed(1)}`
      })`
    : null

  const parts: string[] = [
    `⚽ ${leagueName} — Week ${week.week}`,
    `📅 ${shortDate}${week.format ? ` · ${week.format}` : ''}`,
    '',
    resultLine,
    '',
    '🔵 Team A',
    week.teamA.join(', '),
    '',
    '🟣 Team B',
    week.teamB.join(', '),
  ]

  if (upsetLine) { parts.push(''); parts.push(upsetLine) }
  if (week.notes?.trim()) { parts.push(''); parts.push(week.notes.trim()) }
  parts.push(''); parts.push(`🔗 https://craft-football.com/${shareGameId}`)
  return parts.join('\n')
}

async function handleShare() {
  const text = buildRetroShareText()
  if (!text) return
  if (navigator.share && window.innerWidth < 768) {
    try {
      await navigator.share({ text })
    } catch (err) {
      if (err instanceof DOMException && err.name !== 'AbortError') {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
      }
    }
  } else {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
  }
}
```

- [ ] **Step 4: Update the notes display in `PlayedCard` to split user notes from highlights**

Find the `{week.notes && week.notes.trim() !== '' && (` block in `PlayedCard` (around line 377) and replace it with:

```tsx
{week.notes && week.notes.trim() !== '' && (() => {
  const separator = '\n\n'
  const idx = week.notes!.indexOf(separator)
  const userNotes = idx > -1 ? week.notes!.slice(0, idx).trim() : week.notes!.trim()
  const autoHighlights = idx > -1 ? week.notes!.slice(idx + separator.length).trim() : null
  return (
    <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-2 text-xs text-slate-400 w-full">
      {userNotes && (
        <p className="italic mb-1">{userNotes}</p>
      )}
      {userNotes && autoHighlights && (
        <div className="border-t border-slate-800 my-1.5" />
      )}
      {autoHighlights && (
        <div className="flex flex-col gap-0.5 not-italic">
          {autoHighlights.split('\n').filter(Boolean).map((line, i) => (
            <p key={i} className="text-slate-400">{line}</p>
          ))}
        </div>
      )}
    </div>
  )
})()}
```

- [ ] **Step 5: Add the share button to `PlayedCard` footer**

Find the footer area in `PlayedCard` where `shouldShowMeta` is checked (around line 365). Add the share button alongside the existing footer content. The footer already has a flex row with margin/edit controls. Add the share button to the right:

```tsx
{(shouldShowMeta(week.goal_difference, week.notes) || isAdmin || (leagueName && shareGameId)) && (
  <>
    <div className="border-t border-slate-700 mt-3" />
    <div className="flex flex-wrap items-center gap-2 mt-3">
      {week.goal_difference != null && week.goal_difference !== 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-400 italic">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide not-italic mr-1">
            Margin
          </span>
          +{week.goal_difference} goals
        </div>
      )}
      {week.notes && week.notes.trim() !== '' && (() => {
        // ... (notes display from Step 4 above)
      })()}
      <div className="ml-auto flex items-center gap-2">
        {leagueName && shareGameId && (
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-700 text-slate-400 text-xs hover:border-slate-500 hover:text-slate-300 transition-colors"
          >
            <Share2 className="h-3 w-3" />
            {copied ? 'Copied!' : 'Share'}
          </button>
        )}
        {isAdmin && (
          <EditResultButton onClick={() => setShowEditModal(true)} />
        )}
      </div>
    </div>
  </>
)}
```

> **Important:** The notes display (Step 4) and the share button (Step 5) need to be combined carefully. The notes `<div>` was previously inside the flex wrap. Move it into the same flex row as the share/edit buttons, or keep it full-width above the button row. Follow the existing visual layout from the mockup (notes above, buttons below). Adjust the JSX structure so notes render full-width above the `ml-auto` button row if that reads better.

- [ ] **Step 6: Update `MatchCardProps` and the routing function**

Find the `interface MatchCardProps` (around line 14) and add the new optional props:

```ts
interface MatchCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  goalkeepers?: string[]
  isAdmin?: boolean
  gameId?: string
  allPlayers?: Player[]
  onResultSaved?: () => void
  leagueName?: string     // new
  shareGameId?: string    // new
}
```

Find the `MatchCard` export function and update the destructuring + pass-through to `PlayedCard`:

```ts
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
}: MatchCardProps) {
```

In the switch/conditional that renders `PlayedCard`, pass the new props:

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
  />
)
```

### Part B — `WeekList.tsx`

- [ ] **Step 7: Thread `leagueName` and `shareGameId` through `WeekList`**

In `components/WeekList.tsx`, update the `Props` interface and function signature:

```ts
interface Props {
  weeks: Week[]
  goalkeepers?: string[]
  openWeek?: number | null
  onOpenWeekChange?: (week: number | null) => void
  isAdmin?: boolean
  gameId?: string
  allPlayers?: Player[]
  onResultSaved?: () => void
  leagueName?: string     // new
}
```

In the function destructuring:

```ts
export function WeekList({
  weeks,
  goalkeepers,
  openWeek: controlledOpenWeek,
  onOpenWeekChange,
  isAdmin = false,
  gameId = '',
  allPlayers = [],
  onResultSaved = () => {},
  leagueName,
}: Props) {
```

Pass `leagueName` and `shareGameId={gameId}` to `MatchCard`:

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
  leagueName={leagueName}
  shareGameId={gameId}
/>
```

### Part C — `ResultsRefresher.tsx`

- [ ] **Step 8: Thread `leagueName` through `ResultsRefresher`**

`ResultsRefresher` passes props to `NextMatchCard`, not `WeekList`. For the `WeekList` in the main league page, `leagueName` is threaded from the page server component directly. Verify by checking `app/app/league/[id]/page.tsx` to confirm where `WeekList` is rendered and that `leagueName` is available there.

In `components/ResultsRefresher.tsx`, the `leagueName` prop is already threaded to `NextMatchCard`. No change needed here for the `MatchCard` share — `WeekList` is rendered separately in the page.

Check the league page to confirm `WeekList` receives `leagueName`:

```bash
grep -n "WeekList\|leagueName" app/app/league/\[id\]/page.tsx 2>/dev/null || grep -rn "WeekList" app/ --include="*.tsx" | head -10
```

If `WeekList` does not receive `leagueName` in the page, add the prop wherever `<WeekList` is rendered:

```tsx
<WeekList
  weeks={weeks}
  // ... existing props
  leagueName={league.name}
/>
```

Do the same for the public results page if applicable:

```bash
grep -rn "WeekList\|PublicMatchList" app/ --include="*.tsx" | head -10
```

- [ ] **Step 9: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 10: Run all tests**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add components/MatchCard.tsx components/WeekList.tsx components/ResultsRefresher.tsx
git commit -m "feat: add share button to played MatchCard with retrospective share text"
```

---

## Task 7: Also fix `AwaitingResultCard` in `MatchCard.tsx` (uses `ResultModal` too)

**Files:**
- Modify: `components/MatchCard.tsx`

The `AwaitingResultCard` component also renders `ResultModal`. Its `onSaved` callback needs to match the updated signature.

- [ ] **Step 1: Check current `AwaitingResultCard` `ResultModal` usage**

Find the `<ResultModal` usage in `AwaitingResultCard` (around line 264). The `onSaved` currently calls `setShowResultModal(false)` and `onResultSaved()`. Update to handle the new signature — but since `AwaitingResultCard` does not show a success panel, just call `onResultSaved()` and discard the result data:

First, add `leagueName` and `weeks` to `AwaitingResultCardProps` — but `AwaitingResultCard` is an internal sub-component of `MatchCard` and `MatchCard` doesn't have `weeks`. For simplicity, pass empty arrays and empty string (the success panel only fires from `NextMatchCard`, not from `MatchCard`):

```tsx
{showResultModal && (
  <ResultModal
    scheduledWeek={scheduledWeek}
    lineupMetadata={week.lineupMetadata ?? null}
    allPlayers={allPlayers}
    gameId={gameId}
    leagueName=""
    weeks={[]}
    publicMode={false}
    onSaved={() => {
      setShowResultModal(false)
      onResultSaved()
    }}
    onClose={() => setShowResultModal(false)}
  />
)}
```

> This means the AwaitingResultCard path won't compute highlights or show the success panel. That's acceptable — the "Record Result" button on AwaitingResultCard is an admin shortcut from inside the match history, not the primary flow. The primary flow is through `NextMatchCard`.

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
npx jest --no-coverage 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add components/MatchCard.tsx
git commit -m "fix: update AwaitingResultCard to use updated ResultModal onSaved signature"
```

---

## Self-Review Checklist

- [x] `buildResultShareText()` — spec covered, TDD, all highlight rules implemented
- [x] `ResultSuccessPanel` — new component renders all spec sections
- [x] `ResultModal` — new props, highlights computed, notes combined, `onSaved` signature updated
- [x] `NextMatchCard` — `savedResult` state, success panel rendered, `scheduledWeek` preserved until dismiss
- [x] `PlayedCard` — share button, notes display split, `leagueName`/`shareGameId` props
- [x] `WeekList` — threads `leagueName` and `shareGameId`
- [x] `AwaitingResultCard` — updated `ResultModal` call (no success panel, empty weeks)
- [x] Type names consistent: `shareGameId` used throughout `MatchCard`/`WeekList`; `highlightsText` used in `ResultModal`/`NextMatchCard`/`ResultSuccessPanel`
- [x] Public mode notes write uses `combinedNotes`
- [x] No DB migrations required
- [x] Circular import risk flagged with inline fallback instructions
