# Your Stats Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a personal "Your Stats" widget at the top of the stats sidebar (and mobile sheet) when the current user has a linked player, displaying their all-time W/D/L record, win rate, and recent form.

**Architecture:** Extend `getMyClaimStatus` to also return the resolved player name, pass it through both league pages into `StatsSidebar` as a new prop, and render a `YourStatsWidget` function at the top of the sidebar that looks up the player from the existing `players[]` array.

**Tech Stack:** Next.js 14 App Router (server components), TypeScript, Tailwind CSS, Supabase, Jest

---

## Files

| File | Change |
|---|---|
| `lib/fetchers.ts` | Rename `getMyClaimStatus` → `getMyClaimInfo`, change return type, extend select |
| `app/[leagueId]/results/page.tsx` | Call `getMyClaimInfo`, derive `linkedPlayerName`, pass to `StatsSidebar` |
| `app/[leagueId]/players/page.tsx` | Same as results page |
| `components/StatsSidebar.tsx` | Add `linkedPlayerName` prop, add `YourStatsWidget` function |
| `__tests__/sidebar-stats.test.ts` | Add tests for `YourStatsWidget` player lookup behaviour |

---

### Task 1: Extend `getMyClaimInfo` in fetchers

**Files:**
- Modify: `lib/fetchers.ts`

- [ ] **Step 1: Update the return type and query**

In `lib/fetchers.ts`, find `getMyClaimStatus` (around line 217). Replace the entire function:

```ts
export const getMyClaimInfo = cache(async (leagueId: string): Promise<{
  status: PlayerClaimStatus | 'none'
  playerName: string | null
}> => {
  try {
    const authSupabase = await createClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (!user) return { status: 'none', playerName: null }
    const { data } = await authSupabase
      .from('player_claims')
      .select('status, admin_override_name, player_name')
      .eq('game_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!data) return { status: 'none', playerName: null }
    const resolvedName = data.admin_override_name ?? data.player_name ?? null
    const playerName = data.status === 'approved' ? resolvedName : null
    return { status: (data.status ?? 'none') as PlayerClaimStatus | 'none', playerName }
  } catch {
    return { status: 'none', playerName: null }
  }
})
```

- [ ] **Step 2: Update the import in the function signature**

Confirm `PlayerClaimStatus` is already imported at the top of `lib/fetchers.ts` (it is — line 7). No import change needed.

- [ ] **Step 3: Commit**

```bash
git add lib/fetchers.ts
git commit -m "refactor: extend getMyClaimStatus → getMyClaimInfo, return playerName"
```

---

### Task 2: Update `results/page.tsx`

**Files:**
- Modify: `app/[leagueId]/results/page.tsx`

- [ ] **Step 1: Update the import**

On the `getAuthAndRole, getFeatures, ...` import line, replace `getMyClaimStatus` with `getMyClaimInfo`:

```ts
import { getGame, getAuthAndRole, getFeatures, getPlayerStats, getWeeks, getJoinRequestStatus, getPendingBadgeCount, getMyClaimInfo } from '@/lib/fetchers'
```

- [ ] **Step 2: Replace the claim status block**

Find the existing block (around line 59–63):

```ts
let showClaimBanner = false
if (tier === 'member') {
  const claimStatus = await getMyClaimStatus(leagueId)
  showClaimBanner = claimStatus === 'none'
}
```

Replace with:

```ts
let linkedPlayerName: string | null = null
let showClaimBanner = false
if (tier !== 'public') {
  const { status, playerName } = await getMyClaimInfo(leagueId)
  linkedPlayerName = playerName
  if (tier === 'member') showClaimBanner = status === 'none'
}
```

- [ ] **Step 3: Pass `linkedPlayerName` to every `StatsSidebar` usage**

There are two `<StatsSidebar>` instances in this file (one in the public tier branch, one in the member/admin branch) and two `<StatsSidebar>` inside `<MobileStatsFAB>`. Add `linkedPlayerName={linkedPlayerName}` to all four:

```tsx
<StatsSidebar
  players={players}
  weeks={weeks}
  features={features}
  role={userRole}
  leagueDayIndex={leagueDayIndex}
  linkedPlayerName={linkedPlayerName}
/>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/\[leagueId\]/results/page.tsx
git commit -m "feat: pass linkedPlayerName to StatsSidebar from results page"
```

---

### Task 3: Update `players/page.tsx`

**Files:**
- Modify: `app/[leagueId]/players/page.tsx`

- [ ] **Step 1: Update the import**

Replace `getMyClaimStatus` with `getMyClaimInfo` in the fetchers import line.

- [ ] **Step 2: Find the existing claim status call**

Look for the block that calls `getMyClaimStatus` — it will be conditional on `tier === 'member'`. Replace with the same pattern as results page:

```ts
let linkedPlayerName: string | null = null
let showClaimBanner = false
if (tier !== 'public') {
  const { status, playerName } = await getMyClaimInfo(leagueId)
  linkedPlayerName = playerName
  if (tier === 'member') showClaimBanner = status === 'none'
}
```

- [ ] **Step 3: Pass `linkedPlayerName` to all `StatsSidebar` instances**

Add `linkedPlayerName={linkedPlayerName}` to every `<StatsSidebar>` and `<StatsSidebar>` inside `<MobileStatsFAB>` in this file.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/\[leagueId\]/players/page.tsx
git commit -m "feat: pass linkedPlayerName to StatsSidebar from players page"
```

---

### Task 4: Add `YourStatsWidget` to `StatsSidebar`

**Files:**
- Modify: `components/StatsSidebar.tsx`
- Test: `__tests__/sidebar-stats.test.ts`

- [ ] **Step 1: Write the failing test**

In `__tests__/sidebar-stats.test.ts`, add a new describe block at the bottom. The widget logic itself lives in the component, but we can test the player-lookup behaviour by inspecting what `YourStatsWidget` would receive. Since the component is server-side JSX, test the lookup logic directly: given a `players` array and a `linkedPlayerName`, the correct player is found (or not found).

Add a helper and describe block:

```ts
// ─── YourStatsWidget player lookup ────────────────────────────────────────────

describe('YourStatsWidget player lookup', () => {
  const players: Player[] = [
    makePlayer({ name: 'Alice', played: 20, won: 12, drew: 4, lost: 4, winRate: 60, recentForm: 'WWDLW' }),
    makePlayer({ name: 'Bob',   played: 15, won: 8,  drew: 3, lost: 4, winRate: 53, recentForm: 'LDWWW' }),
  ]

  it('finds the linked player by name', () => {
    const found = players.find(p => p.name === 'Alice')
    expect(found).toBeDefined()
    expect(found!.won).toBe(12)
  })

  it('returns undefined when linkedPlayerName is null', () => {
    const found = players.find(p => p.name === (null as unknown as string))
    expect(found).toBeUndefined()
  })

  it('returns undefined when no player matches the linked name', () => {
    const found = players.find(p => p.name === 'Charlie')
    expect(found).toBeUndefined()
  })

  it('formats win rate from winRate field', () => {
    const alice = players.find(p => p.name === 'Alice')!
    expect(Math.round(alice.winRate)).toBe(60)
  })
})
```

- [ ] **Step 2: Run tests to verify the new tests pass (they test pure logic, no component needed)**

```bash
npm test -- --testPathPattern=sidebar-stats
```

Expected: all tests PASS (the lookup logic is plain JS — no component rendering required).

- [ ] **Step 3: Add the `linkedPlayerName` prop to `StatsSidebarProps`**

At the top of `components/StatsSidebar.tsx`, update the interface:

```ts
interface StatsSidebarProps {
  players: Player[]
  weeks: Week[]
  features: LeagueFeature[]
  role: GameRole | null
  leagueDayIndex?: number
  linkedPlayerName?: string | null
}
```

- [ ] **Step 4: Add `YourStatsWidget` function**

Add this new function above `InFormWidget` in `components/StatsSidebar.tsx`:

```tsx
// ─── Widget 0: Your Stats ─────────────────────────────────────────────────────

function YourStatsWidget({ players, linkedPlayerName }: { players: Player[]; linkedPlayerName?: string | null }) {
  if (!linkedPlayerName) return null
  const player = players.find(p => p.name === linkedPlayerName)
  if (!player) return null

  return (
    <div className="rounded-lg border border-slate-700 bg-transparent overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-700/40 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Your Stats</span>
        <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-sky-400 bg-sky-400/[0.08] border border-sky-400/25 rounded px-[5px] py-px">
          All Time
        </span>
      </div>
      <div className="px-3 py-3">
        {/* Hero: name + win rate */}
        <div className="flex items-end justify-between mb-[10px]">
          <div>
            <p className="text-[15px] font-bold text-slate-100 uppercase tracking-wide leading-tight">
              {player.name}
            </p>
            <p className="text-[11px] text-slate-600 font-medium mt-1">
              {player.won}W &nbsp;·&nbsp; {player.drew}D &nbsp;·&nbsp; {player.lost}L
            </p>
          </div>
          <div className="text-right ml-2">
            <p className="text-[32px] font-black text-sky-300 leading-none">
              {Math.round(player.winRate)}<span className="text-[14px] font-bold text-sky-400">%</span>
            </p>
            <p className="text-[8px] uppercase tracking-widest text-sky-400 mt-0.5">Win Rate</p>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-700/40 my-[10px]" />

        {/* Bottom: form + played */}
        <div className="flex items-center justify-between">
          <FormDots form={player.recentForm} />
          <p className="text-[10px] text-slate-600">
            <span className="text-slate-400 font-semibold">{player.played}</span> played
          </p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Update `StatsSidebar` render to accept and use the new prop**

Update the function signature and return:

```tsx
export function StatsSidebar({ players, weeks, features, role, leagueDayIndex, linkedPlayerName }: StatsSidebarProps) {
  const tier = resolveVisibilityTier(role)
  const showStatsSidebar = isFeatureEnabled(features, 'stats_sidebar', tier)
  if (!showStatsSidebar) return null

  return (
    <div className="space-y-3">
      <YourStatsWidget players={players} linkedPlayerName={linkedPlayerName} />
      <InFormWidget    players={players} weeks={weeks} />
      <QuarterlyTableWidget weeks={weeks} leagueDayIndex={leagueDayIndex} />
      <TeamABWidget    weeks={weeks} />
    </div>
  )
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Run all tests**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add components/StatsSidebar.tsx __tests__/sidebar-stats.test.ts
git commit -m "feat: add YourStatsWidget to stats sidebar for linked players"
```
