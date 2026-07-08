# Honours Quarter Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Share the glory" button to completed quarter cards on the Honours tab that shares an emoji-led text summary (header, champion, awards, top-10 standings) via native share sheet on mobile / clipboard on desktop.

**Architecture:** A pure text builder `buildQuarterShareText()` in `lib/utils.ts` consumes the existing `QuarterSummary` (extended with `gamesPlayed`). A new shared `shareOrCopy()` helper in `lib/utils.ts` centralises the navigator.share/clipboard logic currently duplicated twice in `MatchCard.tsx`. `HonoursSection` gains `leagueName`/`leagueSlug` props and renders a full-width button in the expanded footer of completed quarter cards.

**Tech Stack:** Next.js 14 (App Router), TypeScript strict, Tailwind CSS, Jest (ts-jest, node env by default; jsdom via per-file docblock).

**Spec:** `docs/superpowers/specs/2026-07-08-honours-quarter-share-design.md`

**Notes for the implementer:**
- Run tests with `npm test -- <path>` (jest). The default test environment is `node`; the `shareOrCopy` test file needs a `@jest-environment jsdom` docblock (jest-environment-jsdom is already installed).
- `lib/sidebar-stats.ts` imports from `lib/utils.ts`. To avoid a runtime import cycle, `lib/utils.ts` must import `QuarterSummary` with a **type-only** import (`import type { ... } from './sidebar-stats'`), which is erased at compile time.
- Do not commit anything under `.superpowers/` (already gitignored).

---

### Task 1: `shareOrCopy()` helper

Centralises the share-sheet-or-clipboard logic. Returns `'shared'` (native sheet succeeded), `'copied'` (clipboard write succeeded — caller shows the copied label), or `'failed'` (user cancelled the sheet or clipboard unavailable — caller does nothing).

**Files:**
- Modify: `lib/utils.ts` (append near `buildResultShareText`, ~line 875)
- Test: `lib/__tests__/utils.shareOrCopy.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/utils.shareOrCopy.test.ts`:

```ts
/**
 * @jest-environment jsdom
 */
import { shareOrCopy } from '../utils'

function setInnerWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
}

function setNavigatorShare(fn: ((data: ShareData) => Promise<void>) | undefined) {
  Object.defineProperty(window.navigator, 'share', { value: fn, configurable: true })
}

function setClipboardWriteText(fn: (text: string) => Promise<void>) {
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: fn },
    configurable: true,
  })
}

describe('shareOrCopy', () => {
  afterEach(() => {
    setNavigatorShare(undefined)
  })

  it('copies to clipboard on desktop widths even when navigator.share exists', async () => {
    setInnerWidth(1024)
    const share = jest.fn().mockResolvedValue(undefined)
    const writeText = jest.fn().mockResolvedValue(undefined)
    setNavigatorShare(share)
    setClipboardWriteText(writeText)

    await expect(shareOrCopy('hello')).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(share).not.toHaveBeenCalled()
  })

  it('uses the native share sheet on small screens', async () => {
    setInnerWidth(390)
    const share = jest.fn().mockResolvedValue(undefined)
    const writeText = jest.fn().mockResolvedValue(undefined)
    setNavigatorShare(share)
    setClipboardWriteText(writeText)

    await expect(shareOrCopy('hello')).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith({ text: 'hello' })
    expect(writeText).not.toHaveBeenCalled()
  })

  it('returns failed when the user dismisses the share sheet (AbortError)', async () => {
    setInnerWidth(390)
    const share = jest.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'))
    const writeText = jest.fn().mockResolvedValue(undefined)
    setNavigatorShare(share)
    setClipboardWriteText(writeText)

    await expect(shareOrCopy('hello')).resolves.toBe('failed')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('falls back to clipboard when the share sheet errors (non-abort)', async () => {
    setInnerWidth(390)
    const share = jest.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    const writeText = jest.fn().mockResolvedValue(undefined)
    setNavigatorShare(share)
    setClipboardWriteText(writeText)

    await expect(shareOrCopy('hello')).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('copies on small screens when navigator.share is unavailable', async () => {
    setInnerWidth(390)
    const writeText = jest.fn().mockResolvedValue(undefined)
    setNavigatorShare(undefined)
    setClipboardWriteText(writeText)

    await expect(shareOrCopy('hello')).resolves.toBe('copied')
  })

  it('returns failed when the clipboard write rejects', async () => {
    setInnerWidth(1024)
    setNavigatorShare(undefined)
    setClipboardWriteText(jest.fn().mockRejectedValue(new Error('no clipboard')))

    await expect(shareOrCopy('hello')).resolves.toBe('failed')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/__tests__/utils.shareOrCopy.test.ts`
Expected: FAIL — `shareOrCopy` is not exported from `../utils`.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/utils.ts` (after `buildResultShareText`, before `AVATAR_PALETTE`):

```ts
export type ShareOutcome = 'shared' | 'copied' | 'failed'

/**
 * Shares text via the native share sheet on small screens, otherwise copies
 * it to the clipboard. Mirrors the long-standing MatchCard behaviour:
 * share-sheet dismissal (AbortError) is treated as done; any other share
 * failure falls back to the clipboard.
 */
export async function shareOrCopy(text: string): Promise<ShareOutcome> {
  async function copy(): Promise<ShareOutcome> {
    try {
      await navigator.clipboard.writeText(text)
      return 'copied'
    } catch {
      return 'failed'
    }
  }

  if (navigator.share && window.innerWidth < 768) {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name !== 'AbortError') {
        return copy()
      }
      return 'failed'
    }
  }
  return copy()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/__tests__/utils.shareOrCopy.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.shareOrCopy.test.ts
git commit -m "feat: add shareOrCopy helper for share-sheet/clipboard sharing"
```

---

### Task 2: `gamesPlayed` on `QuarterSummary`

The share header needs "· 12 games" — the count of played weeks in the quarter — which `QuarterSummary` doesn't carry yet.

**Files:**
- Modify: `lib/sidebar-stats.ts` (interface ~line 112, `computeAllQuarters` ~lines 378–401)
- Test: `lib/__tests__/sidebar-stats.quarters.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/sidebar-stats.quarters.test.ts`:

```ts
import { computeAllQuarters } from '../sidebar-stats'
import type { Week, WeekStatus } from '../types'

function makeWeek(weekNum: number, date: string, status: WeekStatus): Week {
  const played = status === 'played'
  return {
    season: '2026',
    week: weekNum,
    date,
    status,
    teamA: played ? ['Dave', 'Ali'] : [],
    teamB: played ? ['Steve', 'Sam'] : [],
    winner: played ? 'teamA' : null,
  }
}

describe('computeAllQuarters gamesPlayed', () => {
  // Fixed "now" in Q3 2026 so Q1 2026 is a completed quarter.
  const now = new Date(2026, 6, 8)

  it('sets gamesPlayed to the played-week count on completed quarters', () => {
    const weeks: Week[] = [
      makeWeek(1, '10 Jan 2026', 'played'),
      makeWeek(2, '17 Jan 2026', 'played'),
      makeWeek(3, '24 Jan 2026', 'cancelled'),
    ]
    const years = computeAllQuarters(weeks, now)
    const q1 = years
      .find(y => y.year === 2026)!
      .quarters.find(q => q.q === 1)!

    expect(q1.status).toBe('completed')
    expect(q1.gamesPlayed).toBe(2)
  })

  it('leaves gamesPlayed unset on non-completed quarters', () => {
    const years = computeAllQuarters([makeWeek(1, '10 Jan 2026', 'played')], now)
    const q3 = years
      .find(y => y.year === 2026)!
      .quarters.find(q => q.q === 3)!

    expect(q3.status).toBe('in_progress')
    expect(q3.gamesPlayed).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/__tests__/sidebar-stats.quarters.test.ts`
Expected: FAIL — TS error: property `gamesPlayed` does not exist on type `QuarterSummary`.

- [ ] **Step 3: Write minimal implementation**

In `lib/sidebar-stats.ts`, add the field to the interface (~line 122, after `awards`):

```ts
export interface QuarterSummary {
  q: number
  year: number
  quarterLabel: string                             // e.g. "Q3 26"
  seasonName: string                               // "Winter" | "Spring" | "Summer" | "Autumn"
  status: QuarterStatus
  weekRange: { from: number; to: number } | null  // null when no game data exists yet
  dateRange: { from: string; to: string }          // "DD MMM YYYY" formatted strings
  champion?: string
  entries?: QuarterlyEntry[]
  awards?: QuarterAward[]
  gamesPlayed?: number                             // played-week count; set for completed quarters only
}
```

In `computeAllQuarters` (~line 379), extend the completed-only block and the `summaries.push`:

```ts
      // Standings (completed only)
      let champion: string | undefined
      let entries: QuarterlyEntry[] | undefined
      let awards: QuarterAward[] | undefined
      let gamesPlayed: number | undefined
      if (status === 'completed') {
        const playedWeeks = qWeeks.filter(w => w.status === 'played')
        entries  = aggregateWeeks(playedWeeks)
        champion = entries[0]?.name
        awards   = buildQuarterAwards(entries, playedWeeks)
        gamesPlayed = playedWeeks.length
      }

      const yy = String(year).slice(-2)
      summaries.push({
        q,
        year,
        quarterLabel: `Q${q} ${yy}`,
        seasonName: SEASON_NAMES[q],
        status,
        weekRange,
        dateRange,
        champion,
        entries,
        awards,
        gamesPlayed,
      })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/__tests__/sidebar-stats.quarters.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/sidebar-stats.ts lib/__tests__/sidebar-stats.quarters.test.ts
git commit -m "feat: add gamesPlayed to completed QuarterSummary"
```

---

### Task 3: `buildQuarterShareText()`

The pure text builder. Full template (from the spec):

```
🏁 That's a wrap on Q2 2026!
⚽ The Boot Room — Spring quarter
📅 05 Apr – 28 Jun · 12 games

👑 Your Spring champion: Dave 🎉

🎖️ Quarter honours
⚽ Iron Man — Steve (14 games)
⚡ Sharp Shooter — Ali (2.4 PPG)

📊 Final standings
1. Dave — 32pts (P14 W10 D2 L2)
2. Ali — 29pts (P12 W9 D2 L1)
3. Steve — 24pts (P14 W7 D3 L4)

🔗 https://craft-football.com/the-boot-room
```

**Files:**
- Modify: `lib/utils.ts` (append after `shareOrCopy` from Task 1)
- Test: `lib/__tests__/utils.quarterShare.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/utils.quarterShare.test.ts`:

```ts
import { buildQuarterShareText } from '../utils'
import type { QuarterSummary, QuarterlyEntry } from '../sidebar-stats'

function entry(
  name: string, points: number, played: number, won: number, drew: number, lost: number
): QuarterlyEntry {
  return { name, played, won, drew, lost, points }
}

function makeQuarter(overrides: Partial<QuarterSummary> = {}): QuarterSummary {
  return {
    q: 2,
    year: 2026,
    quarterLabel: 'Q2 26',
    seasonName: 'Spring',
    status: 'completed',
    weekRange: { from: 14, to: 26 },
    dateRange: { from: '05 Apr 2026', to: '28 Jun 2026' },
    champion: 'Dave',
    entries: [
      entry('Dave', 32, 14, 10, 2, 2),
      entry('Ali', 29, 12, 9, 2, 1),
      entry('Steve', 24, 14, 7, 3, 4),
    ],
    awards: [
      { key: 'champion', nickname: 'Champion', icon: '🏅', player: 'Dave', stat: '32 pts' },
      { key: 'iron_man', nickname: 'Iron Man', icon: '⚽', player: 'Steve', stat: '14 games' },
      { key: 'sharp_shooter', nickname: 'Sharp Shooter', icon: '⚡', player: 'Ali', stat: '2.4 PPG' },
    ],
    gamesPlayed: 12,
    ...overrides,
  }
}

describe('buildQuarterShareText', () => {
  it('renders the full template', () => {
    const text = buildQuarterShareText({
      leagueName: 'The Boot Room',
      leagueSlug: 'the-boot-room',
      quarter: makeQuarter(),
    })

    expect(text).toBe([
      '🏁 That\'s a wrap on Q2 2026!',
      '⚽ The Boot Room — Spring quarter',
      '📅 05 Apr – 28 Jun · 12 games',
      '',
      '👑 Your Spring champion: Dave 🎉',
      '',
      '🎖️ Quarter honours',
      '⚽ Iron Man — Steve (14 games)',
      '⚡ Sharp Shooter — Ali (2.4 PPG)',
      '',
      '📊 Final standings',
      '1. Dave — 32pts (P14 W10 D2 L2)',
      '2. Ali — 29pts (P12 W9 D2 L1)',
      '3. Steve — 24pts (P14 W7 D3 L4)',
      '',
      '🔗 https://craft-football.com/the-boot-room',
    ].join('\n'))
  })

  it('excludes the champion award from the honours block', () => {
    const text = buildQuarterShareText({
      leagueName: 'The Boot Room',
      leagueSlug: 'the-boot-room',
      quarter: makeQuarter(),
    })
    expect(text).not.toContain('🏅 Champion')
    expect(text).toContain('👑 Your Spring champion: Dave 🎉')
  })

  it('omits the honours block entirely when only the champion award exists', () => {
    const text = buildQuarterShareText({
      leagueName: 'The Boot Room',
      leagueSlug: 'the-boot-room',
      quarter: makeQuarter({
        awards: [{ key: 'champion', nickname: 'Champion', icon: '🏅', player: 'Dave', stat: '32 pts' }],
      }),
    })
    expect(text).not.toContain('🎖️ Quarter honours')
  })

  it('caps the standings at 10 entries', () => {
    const entries = Array.from({ length: 12 }, (_, i) =>
      entry(`Player${i + 1}`, 30 - i, 10, 8, 0, 2)
    )
    const text = buildQuarterShareText({
      leagueName: 'The Boot Room',
      leagueSlug: 'the-boot-room',
      quarter: makeQuarter({ entries }),
    })
    expect(text).toContain('10. Player10')
    expect(text).not.toContain('11. Player11')
    expect(text).not.toContain('Player12')
  })

  it('uses singular "game" when only one game was played', () => {
    const text = buildQuarterShareText({
      leagueName: 'The Boot Room',
      leagueSlug: 'the-boot-room',
      quarter: makeQuarter({ gamesPlayed: 1 }),
    })
    expect(text).toContain('· 1 game\n')
    expect(text).not.toContain('1 games')
  })

  it('links to the provided slug', () => {
    const text = buildQuarterShareText({
      leagueName: 'Sunday League',
      leagueSlug: 'sunday-league',
      quarter: makeQuarter(),
    })
    expect(text.endsWith('🔗 https://craft-football.com/sunday-league')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/__tests__/utils.quarterShare.test.ts`
Expected: FAIL — `buildQuarterShareText` is not exported from `../utils`.

- [ ] **Step 3: Write minimal implementation**

In `lib/utils.ts`, add a **type-only** import at the top of the file (type-only avoids a runtime cycle — `sidebar-stats.ts` imports from `utils.ts`):

```ts
import type { QuarterSummary } from './sidebar-stats'
```

Append after `shareOrCopy`:

```ts
/**
 * Builds the plain-text share message for a completed quarter on the
 * Honours tab. Pure function — all data comes from the QuarterSummary.
 */
export function buildQuarterShareText(params: {
  leagueName: string
  leagueSlug: string
  quarter: QuarterSummary
}): string {
  const { leagueName, leagueSlug, quarter } = params
  const { q, year, seasonName, dateRange, entries = [], awards = [], gamesPlayed = 0 } = quarter

  // dateRange strings are 'DD MMM YYYY'; the year already appears in the headline
  const stripYear = (d: string) => d.split(' ').slice(0, 2).join(' ')
  const gamesLabel = gamesPlayed === 1 ? '1 game' : `${gamesPlayed} games`

  const parts: string[] = [
    `🏁 That's a wrap on Q${q} ${year}!`,
    `⚽ ${leagueName} — ${seasonName} quarter`,
    `📅 ${stripYear(dateRange.from)} – ${stripYear(dateRange.to)} · ${gamesLabel}`,
  ]

  const champion = entries[0]?.name
  if (champion) {
    parts.push('')
    parts.push(`👑 Your ${seasonName} champion: ${champion} 🎉`)
  }

  const honours = awards.filter(a => a.key !== 'champion')
  if (honours.length > 0) {
    parts.push('')
    parts.push('🎖️ Quarter honours')
    for (const a of honours) {
      parts.push(`${a.icon} ${a.nickname} — ${a.player} (${a.stat})`)
    }
  }

  if (entries.length > 0) {
    parts.push('')
    parts.push('📊 Final standings')
    entries.slice(0, 10).forEach((e, i) => {
      parts.push(`${i + 1}. ${e.name} — ${e.points}pts (P${e.played} W${e.won} D${e.drew} L${e.lost})`)
    })
  }

  parts.push('')
  parts.push(`🔗 https://craft-football.com/${leagueSlug}`)

  return parts.join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/__tests__/utils.quarterShare.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.quarterShare.test.ts
git commit -m "feat: add buildQuarterShareText for honours quarter sharing"
```

---

### Task 4: Share button on completed quarter cards

Wire the button into `HonoursSection` and pass league identity down from the page. No component-test infrastructure exists for this repo's components — verification is typecheck + existing tests + manual check.

**Files:**
- Modify: `components/HonoursSection.tsx`
- Modify: `app/[slug]/honours/page.tsx:94`

- [ ] **Step 1: Add props and the share footer to `components/HonoursSection.tsx`**

Update the imports (top of file):

```ts
import { cn, buildQuarterShareText, shareOrCopy } from '@/lib/utils'
```

Update the props interface:

```ts
interface HonoursSectionProps {
  data: HonoursYear[]
  leagueName: string
  leagueSlug: string
}
```

Update `CompletedCardBody` to accept league identity, own the copied state, and render the footer. Replace the existing function signature and add the handler + footer (the awards strip and table markup are unchanged):

```tsx
function CompletedCardBody({
  quarter,
  leagueName,
  leagueSlug,
}: {
  quarter: QuarterSummary
  leagueName: string
  leagueSlug: string
}) {
  const [showAll, setShowAll] = useState(false)
  const [copied, setCopied] = useState(false)
  const entries = quarter.entries ?? []
  const visibleEntries = showAll ? entries : entries.slice(0, PAGE_SIZE)
  const overflowCount = Math.max(0, entries.length - PAGE_SIZE)

  async function handleShare() {
    const text = buildQuarterShareText({ leagueName, leagueSlug, quarter })
    const result = await shareOrCopy(text)
    if (result === 'copied') {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Collapsible.Content className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
      {/* ── existing awards strip, unchanged ── */}
      {/* ── existing standings table div, unchanged ── */}

      <div className="border-t border-slate-700 px-4 py-3">
        <button
          type="button"
          onClick={handleShare}
          className="w-full px-3 py-2 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-colors"
        >
          {copied ? 'Copied — go and brag 📣' : 'Share the glory'}
        </button>
      </div>
    </Collapsible.Content>
  )
}
```

The new footer `<div>` goes **after** the standings-table `<div className="border-t border-slate-700 px-4 py-3">` block, as the last child of `Collapsible.Content`.

Thread the props through `QuarterCard` (only the completed branch uses them):

```tsx
function QuarterCard({
  quarter,
  isOpen,
  onToggle,
  leagueName,
  leagueSlug,
}: {
  quarter: QuarterSummary
  isOpen: boolean
  onToggle: () => void
  leagueName: string
  leagueSlug: string
}) {
```

…and in its completed-branch JSX:

```tsx
        <CompletedCardBody quarter={quarter} leagueName={leagueName} leagueSlug={leagueSlug} />
```

Finally update the section component:

```tsx
export function HonoursSection({ data, leagueName, leagueSlug }: HonoursSectionProps) {
```

…and pass through where `QuarterCard` is rendered:

```tsx
                <QuarterCard
                  key={key}
                  quarter={quarter}
                  isOpen={openKey === key}
                  onToggle={() => setOpenKey(openKey === key ? null : key)}
                  leagueName={leagueName}
                  leagueSlug={leagueSlug}
                />
```

- [ ] **Step 2: Pass league identity from the page**

In `app/[slug]/honours/page.tsx` (line 94), change:

```tsx
            <HonoursSection data={computeAllQuarters(weeks, new Date())} />
```

to:

```tsx
            <HonoursSection
              data={computeAllQuarters(weeks, new Date())}
              leagueName={game.name}
              leagueSlug={slug}
            />
```

- [ ] **Step 3: Typecheck and run the test suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, open a league's Honours tab as a member, expand a completed quarter:
- Full-width "Share the glory" button below the standings table, separated by a border.
- Desktop click → clipboard contains the full template message; label reads "Copied — go and brag 📣" for ~2s.
- In-progress and upcoming cards show no button.
- Clicking the button does not collapse the card.

- [ ] **Step 5: Commit**

```bash
git add components/HonoursSection.tsx app/[slug]/honours/page.tsx
git commit -m "feat: share button on completed honours quarter cards"
```

---

### Task 5: Refactor MatchCard's duplicated share logic onto `shareOrCopy`

Behaviour-preserving cleanup from the spec: both `handleShare` implementations in `MatchCard.tsx` inline the same share-sheet/clipboard dance that `shareOrCopy` now owns.

**Files:**
- Modify: `components/MatchCard.tsx` (DNF handler ~line 215, played handler ~line 510 — line numbers approximate)

- [ ] **Step 1: Refactor both handlers**

Add `shareOrCopy` to the existing `@/lib/utils` import at the top of `components/MatchCard.tsx`:

```ts
import { cn, shouldShowMeta, isPastDeadline, buildResultShareText, buildDnfShareText, shareOrCopy } from '@/lib/utils'
```

Replace the DNF card's `handleShare` (currently ~lines 215–248) with:

```ts
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
    if (await shareOrCopy(shareText) === 'copied') {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }
```

Replace the played card's `handleShare` (currently ~lines 510–540) with:

```ts
  async function handleShare() {
    if (!leagueName || !leagueSlug || !weeks || !week.winner) return
    try {
      const { shareText } = buildResultShareText({
        leagueName,
        leagueSlug,
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
      if (await shareOrCopy(shareText) === 'copied') {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch { /* ignore share errors */ }
  }
```

- [ ] **Step 2: Typecheck and run the test suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 3: Manual verification**

In `npm run dev`, on the Results tab: share the most recent played match on desktop → clipboard message unchanged, "Copied!" label appears. Same for a DNF card if one exists.

- [ ] **Step 4: Commit**

```bash
git add components/MatchCard.tsx
git commit -m "refactor: MatchCard share handlers use shareOrCopy helper"
```

---

### Task 6: Final verification

- [ ] **Step 1: Full suite + build**

Run: `npm test`
Expected: all suites PASS.

Run: `npm run build`
Expected: builds cleanly with no type errors.

- [ ] **Step 2: Spec conformance sweep**

Re-read `docs/superpowers/specs/2026-07-08-honours-quarter-share-design.md` and confirm each Behaviour / Message template rule is implemented. In particular: button only on `status === 'completed'` cards, exact label pair, champion excluded from honours block, standings capped at 10, singular "1 game", `🔗` slug link.
