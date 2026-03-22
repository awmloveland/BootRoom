# The Lineup Lab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "The Lineup Lab" tab to the league page — a scratchpad where members can pick players, drag them into teams, and run the balance algorithm, without affecting any real match data.

**Architecture:** Extract the shared `FormDots` component, then extend `LeaguePageHeader` with a conditional third tab, then build the `LineupLab` client component and its backing server page. No database writes. Access is gated by the existing `team_builder` feature flag.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Radix UI, `lucide-react`, Supabase (read-only), `lib/autoPick.ts` for team balancing.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `components/FormDots.tsx` | **Create** | Extracted `FormDots` component + `FORM_COLOR` map |
| `components/NextMatchCard.tsx` | **Modify** | Import `FormDots` from new shared file |
| `components/LeaguePageHeader.tsx` | **Modify** | Add `showLineupLabTab` prop + Lineup Lab tab link |
| `app/[leagueId]/results/page.tsx` | **Modify** | Pass `showLineupLabTab` to header |
| `app/[leagueId]/players/page.tsx` | **Modify** | Pass `showLineupLabTab` to header |
| `components/LineupLab.tsx` | **Create** | Client component — all scratchpad state and UI |
| `app/[leagueId]/lineup-lab/page.tsx` | **Create** | Server component — access gate + data fetch |

---

## Task 1: Extract `FormDots` into a shared component

`FormDots` and `FORM_COLOR` currently live inside `NextMatchCard.tsx`. Moving them to `components/FormDots.tsx` lets `LineupLab.tsx` reuse them without duplication.

**Files:**
- Create: `components/FormDots.tsx`
- Modify: `components/NextMatchCard.tsx`

- [ ] **Step 1: Create `components/FormDots.tsx`**

```tsx
// components/FormDots.tsx
import { cn } from '@/lib/utils'

export const FORM_COLOR: Record<string, string> = {
  W: 'text-sky-400',
  D: 'text-slate-400',
  L: 'text-red-400',
  '-': 'text-slate-700',
}

export function FormDots({ form }: { form: string }) {
  return (
    <span className="flex gap-1">
      {form.split('').map((char, i) => (
        <span key={i} className={cn('font-mono text-xs font-bold', FORM_COLOR[char] ?? 'text-slate-600')}>
          {char}
        </span>
      ))}
    </span>
  )
}
```

- [ ] **Step 2: Update `NextMatchCard.tsx` to import from the new file**

Remove the `FORM_COLOR` const and `FormDots` function definition from `NextMatchCard.tsx` (lines 16–33). Add this import at the top:

```tsx
import { FormDots } from '@/components/FormDots'
```

- [ ] **Step 3: Verify the build is clean**

```bash
npm run build
```

Expected: no TypeScript errors, no missing-export errors.

- [ ] **Step 4: Commit**

```bash
git add components/FormDots.tsx components/NextMatchCard.tsx
git commit -m "refactor: extract FormDots into shared component"
```

---

## Task 2: Extend `LeaguePageHeader` with the Lineup Lab tab

Add a `showLineupLabTab: boolean` prop. When `true`, render a third tab for The Lineup Lab using the `FlaskConical` icon.

**Files:**
- Modify: `components/LeaguePageHeader.tsx`

- [ ] **Step 1: Add `FlaskConical` to the import and extend the props**

Current file top:
```tsx
import { Settings, ClipboardList, Users } from 'lucide-react'
// ...
interface LeaguePageHeaderProps {
  leagueName: string
  leagueId: string
  playedCount: number
  totalWeeks: number
  pct: number
  currentTab: 'results' | 'players'
  isAdmin: boolean
}
```

Replace with:
```tsx
import { Settings, ClipboardList, Users, FlaskConical } from 'lucide-react'
// ...
interface LeaguePageHeaderProps {
  leagueName: string
  leagueId: string
  playedCount: number
  totalWeeks: number
  pct: number
  currentTab: 'results' | 'players' | 'lineup-lab'
  isAdmin: boolean
  showLineupLabTab?: boolean
}
```

- [ ] **Step 2: Add the Lineup Lab tab link inside the `<nav>`**

After the closing `</Link>` for the Players tab (currently the last item in `<nav>`), add:

```tsx
{showLineupLabTab && (
  <Link
    href={`/${leagueId}/lineup-lab`}
    className={cn(
      '-mb-px flex items-center gap-2 border-b-2 pb-2 text-base font-medium',
      currentTab === 'lineup-lab'
        ? 'border-slate-100 text-slate-100'
        : 'border-transparent text-slate-400 hover:text-slate-200'
    )}
  >
    <FlaskConical className="size-4" />
    The Lineup Lab
  </Link>
)}
```

- [ ] **Step 3: Verify the build is clean**

```bash
npm run build
```

Expected: no TypeScript errors. The `showLineupLabTab` prop is optional so existing callers without it still compile.

- [ ] **Step 4: Commit**

```bash
git add components/LeaguePageHeader.tsx
git commit -m "feat: add Lineup Lab tab to LeaguePageHeader"
```

---

## Task 3: Pass `showLineupLabTab` from `results/page.tsx` and `players/page.tsx`

Both existing pages call `<LeaguePageHeader>` but don't yet pass `showLineupLabTab`. Add it to both, computing it the same way the page already computes `canSeeTeamBuilder`.

**Files:**
- Modify: `app/[leagueId]/results/page.tsx`
- Modify: `app/[leagueId]/players/page.tsx`

### results/page.tsx

- [ ] **Step 1: Pass `showLineupLabTab` to `<LeaguePageHeader>`**

`results/page.tsx` already computes `canSeeTeamBuilder` (line 86). The public-tier early-return (lines 89–95) renders `<LeaguePrivateState>`, not `<LeaguePageHeader>`, so there is only **one** `<LeaguePageHeader>` call in this file. Add the prop to it:

```tsx
showLineupLabTab={canSeeTeamBuilder}
```

`canSeeTeamBuilder` is already `false` for the public tier by construction (the `team_builder` feature flag has `public_enabled: false` by default), so no separate public-tier guard is needed.

- [ ] **Step 2: Verify**

```bash
npm run build
```

### players/page.tsx

- [ ] **Step 3: Compute `canSeeTeamBuilder` in `players/page.tsx`**

`players/page.tsx` does not currently compute this. After the existing `const isAdmin = tier === 'admin'` line, add:

```tsx
const canSeeTeamBuilder = isAdmin || isFeatureEnabled(rawFeatures, 'team_builder', tier)
```

- [ ] **Step 4: Pass `showLineupLabTab` to `<LeaguePageHeader>`**

`players/page.tsx` has one `<LeaguePageHeader>` call. Add:
```tsx
showLineupLabTab={tier === 'public' ? false : canSeeTeamBuilder}
```

- [ ] **Step 5: Verify and commit**

```bash
npm run build
git add app/[leagueId]/results/page.tsx app/[leagueId]/players/page.tsx
git commit -m "feat: wire showLineupLabTab into results and players pages"
```

---

## Task 4: Build `LineupLab.tsx` — the scratchpad client component

This is the main interactive component. It manages `teamA` and `teamB` state, handles player chip interactions, drag-and-drop, auto-balance, and renders the full layout described in the spec.

**Files:**
- Create: `components/LineupLab.tsx`

Reference `NextMatchCard.tsx` lines 158–732 closely for the drag-and-drop and balance bar patterns.

- [ ] **Step 1: Create `components/LineupLab.tsx` with the skeleton**

```tsx
'use client'

import { useRef, useState } from 'react'
import { cn, ewptScore, winProbability, winCopy } from '@/lib/utils'
import { autoPick } from '@/lib/autoPick'
import { FormDots } from '@/components/FormDots'
import type { Player } from '@/lib/types'

interface Props {
  allPlayers: Player[]
}

export function LineupLab({ allPlayers }: Props) {
  const [teamA, setTeamA] = useState<Player[]>([])
  const [teamB, setTeamB] = useState<Player[]>([])
  const [dragOver, setDragOver] = useState<{ team: 'A' | 'B'; index: number } | null>(null)
  const dragSource = useRef<{ team: 'A' | 'B'; index: number } | null>(null)

  const selectedNames = new Set([...teamA, ...teamB].map((p) => p.name))
  const totalSelected = teamA.length + teamB.length
  const sortedPlayers = [...allPlayers].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="space-y-4">
      {/* TODO: implement */}
    </div>
  )
}
```

- [ ] **Step 2: Implement player chip tap interactions**

Add these handlers inside `LineupLab` before the return:

```tsx
function addPlayer(player: Player) {
  if (teamA.length <= teamB.length) {
    setTeamA((prev) => [...prev, player])
  } else {
    setTeamB((prev) => [...prev, player])
  }
}

function removePlayer(player: Player) {
  setTeamA((prev) => prev.filter((p) => p.name !== player.name))
  setTeamB((prev) => prev.filter((p) => p.name !== player.name))
}

function handleChipClick(player: Player) {
  if (selectedNames.has(player.name)) {
    removePlayer(player)
  } else {
    addPlayer(player)
  }
}
```

- [ ] **Step 3: Implement drag-and-drop swap handler**

Add this handler inside `LineupLab` (mirrors `NextMatchCard`):

```tsx
function handleSwap(dropTeam: 'A' | 'B', dropIndex: number) {
  if (!dragSource.current) return
  const { team: srcTeam, index: srcIndex } = dragSource.current
  if (srcTeam === dropTeam && srcIndex === dropIndex) return

  const nextA = [...teamA]
  const nextB = [...teamB]
  const srcArr = srcTeam === 'A' ? nextA : nextB
  const dropArr = dropTeam === 'A' ? nextA : nextB

  if (srcTeam === dropTeam) {
    // Reorder within the same team
    const [moved] = srcArr.splice(srcIndex, 1)
    srcArr.splice(dropIndex, 0, moved)
  } else {
    // Swap across teams
    const temp = srcArr[srcIndex]
    srcArr[srcIndex] = dropArr[dropIndex]
    dropArr[dropIndex] = temp
  }

  setTeamA(nextA)
  setTeamB(nextB)
}
```

- [ ] **Step 4: Implement auto-balance handler**

```tsx
function handleAutoBalance() {
  const allSelected = [...teamA, ...teamB]
  if (allSelected.length < 2) return
  const result = autoPick(allSelected)
  if (result.suggestions.length === 0) return
  const suggestion = result.suggestions[0]
  setTeamA(suggestion.teamA)
  setTeamB(suggestion.teamB)
}

function handleClearAll() {
  setTeamA([])
  setTeamB([])
}
```

- [ ] **Step 5: Implement the full JSX return**

Replace the `{/* TODO: implement */}` placeholder with the complete layout:

```tsx
return (
  <div className="space-y-5">

    {/* Intro card */}
    <div className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 flex gap-3 items-start">
      <span className="text-lg leading-none mt-0.5">⚽</span>
      <div>
        <p className="text-sm font-semibold text-slate-100">The Lineup Lab</p>
        <p className="mt-1 text-xs text-slate-400 leading-relaxed">
          Pick players, drag them around, see how the teams balance out. Nothing here affects the actual match.
        </p>
      </div>
    </div>

    {/* Action row */}
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={handleAutoBalance}
        disabled={totalSelected < 2}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:border-slate-600 hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        ⚖️ Auto-Balance Teams
      </button>
      <button
        type="button"
        onClick={handleClearAll}
        disabled={totalSelected === 0}
        className="text-xs text-slate-500 hover:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        ↺ Clear all
      </button>
    </div>

    {/* Teams grid or empty state */}
    {totalSelected === 0 ? (
      <p className="text-sm text-slate-500 text-center py-4">Select players below to get started.</p>
    ) : (
      <>
        <div className="grid grid-cols-2 gap-3">
          {(['A', 'B'] as const).map((team) => {
            const players = team === 'A' ? teamA : teamB
            const score = ewptScore(players)
            return (
              <div key={team}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-slate-100">Team {team}</p>
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-xs font-semibold tabular-nums',
                    team === 'A'
                      ? 'bg-sky-900/60 border border-sky-700 text-sky-300'
                      : 'bg-violet-900/60 border border-violet-700 text-violet-300'
                  )}>
                    {score.toFixed(3)}
                  </span>
                </div>
                <div className="space-y-1 min-h-[32px]">
                  {players.length === 0 ? (
                    <div className={cn(
                      'rounded border border-dashed px-2.5 py-3 text-center text-xs',
                      team === 'A' ? 'border-sky-900/40 text-sky-900' : 'border-violet-900/40 text-violet-900'
                    )}>
                      Drop here
                    </div>
                  ) : (
                    players.map((p, i) => {
                      const isOver = dragOver?.team === team && dragOver?.index === i
                      return (
                        <div
                          key={p.name}
                          draggable
                          onDragStart={() => { dragSource.current = { team, index: i } }}
                          onDragOver={(e) => { e.preventDefault(); setDragOver({ team, index: i }) }}
                          onDragLeave={() => setDragOver(null)}
                          onDrop={() => handleSwap(team, i)}
                          onDragEnd={() => { dragSource.current = null; setDragOver(null) }}
                          className={cn(
                            'flex items-center justify-between px-2.5 py-1.5 rounded border cursor-grab active:cursor-grabbing transition-colors select-none',
                            team === 'A'
                              ? isOver ? 'bg-sky-800/60 border-sky-600' : 'bg-sky-950/40 border-sky-900/60'
                              : isOver ? 'bg-violet-800/60 border-violet-600' : 'bg-violet-950/40 border-violet-900/60'
                          )}
                        >
                          <span className={cn('text-xs font-medium', team === 'A' ? 'text-sky-100' : 'text-violet-100')}>
                            {p.name}{p.goalkeeper ? ' 🧤' : ''}
                          </span>
                          {p.recentForm && <FormDots form={p.recentForm} />}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Balance bar — only when both teams have at least 1 player */}
        {teamA.length > 0 && teamB.length > 0 && (() => {
          const scoreA = ewptScore(teamA)
          const scoreB = ewptScore(teamB)
          const winProbA = winProbability(scoreA, scoreB)
          const winProbB = 1 - winProbA
          const copy = winCopy(winProbA)
          const isEven = copy.team === 'even'
          return (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5">
                <span className={cn('text-[15px] font-bold tabular-nums min-w-[34px]', isEven ? 'text-slate-400' : 'text-sky-300')}>
                  {Math.round(winProbA * 100)}%
                </span>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden flex">
                  <div className="bg-sky-600 transition-all" style={{ width: `${winProbA * 100}%` }} />
                  <div className="bg-violet-600 flex-1" />
                </div>
                <span className={cn('text-[15px] font-bold tabular-nums min-w-[34px] text-right', isEven ? 'text-slate-400' : 'text-violet-300')}>
                  {Math.round(winProbB * 100)}%
                </span>
              </div>
              <p className={cn('text-xs font-medium text-center', copy.team === 'A' ? 'text-sky-400' : copy.team === 'B' ? 'text-violet-400' : 'text-slate-400')}>
                {copy.text}
              </p>
            </div>
          )
        })()}
      </>
    )}

    {/* Divider */}
    <hr className="border-slate-800" />

    {/* Player pool */}
    <div>
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">All players — tap to add</p>
      <div className="flex flex-wrap gap-2">
        {sortedPlayers.map((player) => {
          const inA = teamA.some((p) => p.name === player.name)
          const inB = teamB.some((p) => p.name === player.name)
          return (
            <button
              key={player.name}
              type="button"
              onClick={() => handleChipClick(player)}
              className={cn(
                'px-3 py-1 rounded-full text-xs border transition-colors',
                inA
                  ? 'bg-sky-950/60 border-sky-800 text-sky-300 hover:border-sky-600'
                  : inB
                    ? 'bg-violet-950/60 border-violet-800 text-violet-300 hover:border-violet-600'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100'
              )}
            >
              {player.name}{player.goalkeeper ? ' 🧤' : ''}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-slate-600">Coloured = in a team · tap a coloured chip to remove</p>
    </div>

  </div>
)
```

- [ ] **Step 6: Verify the build is clean**

```bash
npm run build
```

Expected: no TypeScript errors. The component is not rendered anywhere yet so no visual check needed yet.

- [ ] **Step 7: Commit**

```bash
git add components/LineupLab.tsx
git commit -m "feat: build LineupLab scratchpad client component"
```

---

## Task 5: Create the `lineup-lab` server page

The server component fetches the league, checks auth, resolves the feature flag, fetches players, and either redirects (access denied) or renders `LineupLab`.

**Files:**
- Create: `app/[leagueId]/lineup-lab/page.tsx`

- [ ] **Step 1: Create `app/[leagueId]/lineup-lab/page.tsx`**

```tsx
export const dynamic = 'force-dynamic'

import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolveVisibilityTier } from '@/lib/roles'
import { isFeatureEnabled } from '@/lib/features'
import { LeaguePageHeader } from '@/components/LeaguePageHeader'
import { LineupLab } from '@/components/LineupLab'
import { DEFAULT_FEATURES } from '@/lib/defaults'
import type { GameRole, LeagueFeature, FeatureKey, Player } from '@/lib/types'

interface Props {
  params: Promise<{ leagueId: string }>
}

export default async function LineupLabPage({ params }: Props) {
  const { leagueId } = await params
  const service = createServiceClient()

  // 1. Verify league exists
  const { data: game } = await service
    .from('games')
    .select('id, name')
    .eq('id', leagueId)
    .maybeSingle()

  if (!game) notFound()

  // 2. Resolve auth + league membership
  let userRole: GameRole | null = null
  try {
    const authSupabase = await createClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (user) {
      const { data: memberRow } = await service
        .from('game_members')
        .select('role')
        .eq('game_id', leagueId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (memberRow) {
        userRole = memberRow.role as GameRole
      }
    }
  } catch (err) {
    console.error('[lineup-lab] auth check failed:', err)
  }

  const tier = resolveVisibilityTier(userRole)
  const isAdmin = tier === 'admin'

  // 3. Fetch feature flags
  const [experimentsResult, leagueFeaturesResult, weeksResult] = await Promise.all([
    service.from('feature_experiments').select('feature, available'),
    service.from('league_features').select('*').eq('game_id', leagueId),
    service.from('weeks').select('week', { count: 'exact', head: true }).eq('game_id', leagueId).in('status', ['played', 'cancelled']),
  ])

  const playedCount = weeksResult.count ?? 0
  const totalWeeks = 52
  const pct = Math.round((playedCount / totalWeeks) * 100)

  const availableSet = experimentsResult.error
    ? new Set(DEFAULT_FEATURES.map((f) => f.feature as FeatureKey))
    : new Set(
        (experimentsResult.data ?? [])
          .filter((e) => e.available)
          .map((e) => e.feature as FeatureKey)
      )
  const featureMap = Object.fromEntries((leagueFeaturesResult.data ?? []).map((f) => [f.feature, f]))
  const features: LeagueFeature[] = DEFAULT_FEATURES
    .filter((def) => availableSet.has(def.feature))
    .map((def) => {
      const row = featureMap[def.feature] ?? def
      return { ...row, available: true } as LeagueFeature
    })

  const canSeeTeamBuilder = isAdmin || isFeatureEnabled(features, 'team_builder', tier)

  // 4. Gate access — redirect if not enabled for this user's tier
  if (!canSeeTeamBuilder) {
    redirect(`/${leagueId}/results`)
  }

  // 5. Fetch players
  const { data: playersData } = await service.rpc('get_player_stats_public', {
    p_game_id: leagueId,
  })

  const players: Player[] = ((playersData ?? []) as Record<string, unknown>[]).map((row) => ({
    name: String(row.name),
    played: Number(row.played),
    won: Number(row.won),
    drew: Number(row.drew),
    lost: Number(row.lost),
    timesTeamA: Number(row.timesTeamA ?? 0),
    timesTeamB: Number(row.timesTeamB ?? 0),
    winRate: Number(row.winRate),
    qualified: Boolean(row.qualified),
    points: Number(row.points ?? 0),
    goalkeeper: Boolean(row.goalkeeper),
    mentality: String(row.mentality ?? 'balanced') as Player['mentality'],
    rating: Number(row.rating ?? 0),
    recentForm: String(row.recentForm ?? ''),
  }))

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-4 pb-8">
      <LeaguePageHeader
        leagueName={game.name}
        leagueId={leagueId}
        playedCount={playedCount}
        totalWeeks={totalWeeks}
        pct={pct}
        currentTab="lineup-lab"
        isAdmin={isAdmin}
        showLineupLabTab={true}
      />
      <LineupLab allPlayers={players} />
    </main>
  )
}
```

- [ ] **Step 2: Verify the full build passes**

```bash
npm run build
```

Expected: no TypeScript errors, no missing module errors.

- [ ] **Step 3: Run existing tests to confirm nothing regressed**

```bash
npm test
```

Expected: all existing tests pass (autoPick, utils, goalkeeper).

- [ ] **Step 4: Commit**

```bash
git add app/[leagueId]/lineup-lab/page.tsx
git commit -m "feat: add Lineup Lab server page"
```

---

## Final verification checklist

Before raising a PR, manually verify these scenarios in the running dev server (`npm run dev`):

- [ ] As a **member**: The Lineup Lab tab appears in the league header. Navigating to it loads the page.
- [ ] As a **public visitor** (not logged in): The Lineup Lab tab does not appear in Results or Players headers.
- [ ] **Adding players**: Tapping grey chips adds them alternately to Team A then B. Chips turn blue/purple.
- [ ] **Removing players**: Tapping a coloured chip removes the player. Chip returns to grey.
- [ ] **Balance bar**: Appears only once both teams have at least 1 player. Percentages and commentary update live as players are added/removed.
- [ ] **Drag and drop**: Players can be dragged within a team (reorder) and across teams (swap). Drop highlight appears on the target row.
- [ ] **Auto-Balance**: Button is disabled with 0–1 players selected. With 2+ players, clicking it reshuffles both teams using the algorithm.
- [ ] **Clear all**: Button is disabled with 0 players. With players selected, clicking it resets everything.
- [ ] **Tab switching**: Navigate away to Results then back to Lineup Lab — state is preserved (same players still selected).
- [ ] **Page refresh**: State resets — teams are empty on reload.
- [ ] **Feature flag off** (toggle `team_builder.enabled` off in Settings → Features): Visiting `/[leagueId]/lineup-lab` as a member redirects to `/[leagueId]/results`. Tab disappears from header.
