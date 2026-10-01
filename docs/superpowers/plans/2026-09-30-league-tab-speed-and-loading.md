# League Tab Speed and Loading State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make switching between the four league tabs respond instantly with a skeleton and cut the server render time by collapsing the Supabase fetch chain and co-locating Vercel functions with the database.

**Architecture:** Three independent layers. (1) A one-line Vercel region change. (2) `lib/fetchers.ts` gains a cached `getUser()` shared by every auth-dependent fetcher, plus two self-sufficient fetchers so the four tab pages can run everything in one `Promise.all`. (3) A `LeagueTabSkeleton` server component rendered by a one-line `loading.tsx` in each tab directory, which also enables Next.js link prefetching for these dynamic routes.

**Tech Stack:** Next.js 16 App Router, React 19 `cache()`, Supabase JS, Tailwind v4 utilities, Jest with ts-jest and Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-30-league-tab-speed-and-loading-design.md`

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `vercel.json` | Modify | Pin functions to `dub1` |
| `lib/fetchers.ts` | Modify | `getAuthClient`, `getUser`, role-gated badge count, `getMyJoinRequestStatus`, public short-circuit in `getMyClaimInfo` |
| `lib/__tests__/fetchers.test.ts` | Create | Behavioural tests for the fetchers above with mocked Supabase clients |
| `app/[slug]/layout.tsx` | Modify | Stop awaiting warm-up fetches |
| `app/[slug]/results/page.tsx` | Modify | Single `Promise.all`, no trailing fetches |
| `app/[slug]/players/page.tsx` | Modify | Same |
| `app/[slug]/honours/page.tsx` | Modify | Same |
| `app/[slug]/lineup-lab/page.tsx` | Modify | Same (no claim info) |
| `components/LeagueTabSkeleton.tsx` | Create | Skeleton mirroring the tab page layout, active tab highlighted |
| `__tests__/league-tab-skeleton.test.tsx` | Create | Renders all four tab labels, marks the active one |
| `app/[slug]/results/loading.tsx` | Create | `<LeagueTabSkeleton tab="results" />` |
| `app/[slug]/players/loading.tsx` | Create | `<LeagueTabSkeleton tab="players" />` |
| `app/[slug]/honours/loading.tsx` | Create | `<LeagueTabSkeleton tab="honours" />` |
| `app/[slug]/lineup-lab/loading.tsx` | Create | `<LeagueTabSkeleton tab="lineup-lab" />` |

Notes for the implementer:

- This repo is on **Next.js 16**, not 14 as `CLAUDE.md` says. `proxy.ts` is the middleware. Do not create `middleware.ts`.
- Under Jest, `react`'s `cache()` is a passthrough (no memoisation outside a server render). Tests therefore assert **behaviour** (what is returned, which RPCs are or are not called), never call counts across fetchers.
- Never use bare `git stash` in this worktree.
- Tailwind palette rules: placeholder blocks are `bg-slate-800`. No green, yellow or orange anywhere.

---

### Task 1: Pin Vercel functions to Dublin and record a timing baseline

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Record the baseline tab timings on the current production build**

The `.next` directory already holds a build of the current code. Start it and time each tab three times, signed out.

Run:
```bash
cd /Users/willloveland/conductor/workspaces/bootroom/chisinau
(npx next start -p 3123 > .context/next-start.log 2>&1 &); sleep 3
for pass in 1 2 3; do for tab in results players honours lineup-lab; do curl -s -o /dev/null -w "pass $pass  %{time_starttransfer}s  $tab\n" "http://localhost:3123/craft-football/$tab"; done; done | tee .context/timing-before.txt
pkill -f next-server; sleep 1
```
Expected: twelve lines, each between roughly 0.4 s and 1.3 s. Saved to `.context/timing-before.txt` for comparison in Task 10.

- [ ] **Step 2: Add the region**

Replace the whole of `vercel.json` with:

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "regions": ["dub1"],
  "redirects": [
    {
      "source": "/:path*",
      "has": [{ "type": "host", "value": "m.craft-football.com" }],
      "destination": "https://craft-football.com/:path*",
      "permanent": true
    }
  ]
}
```

- [ ] **Step 3: Validate the JSON**

Run: `node -e "console.log(require('./vercel.json').regions)"`
Expected: `[ 'dub1' ]`

- [ ] **Step 4: Commit**

```bash
git add vercel.json
git commit -m "Run Vercel functions in Dublin, co-located with the Supabase database

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Shared cached auth client and user in `lib/fetchers.ts`

**Files:**
- Modify: `lib/fetchers.ts`
- Create: `lib/__tests__/fetchers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/fetchers.test.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase/service', () => ({ createServiceClient: jest.fn() }))

// Import after the mocks are registered.
import { getUser, getAuthAndRole } from '@/lib/fetchers'

const LEAGUE = '11111111-1111-1111-1111-111111111111'
const USER = { id: 'user-1', email: 'a@b.c' }

/** Builds a chainable query mock whose terminal `maybeSingle` resolves to `data`. */
function queryReturning(data: unknown) {
  const chain: Record<string, jest.Mock> = {}
  for (const m of ['select', 'eq', 'in', 'order']) chain[m] = jest.fn(() => chain)
  chain.maybeSingle = jest.fn().mockResolvedValue({ data, error: null })
  return chain
}

function mockAuth(user: typeof USER | null) {
  const getUserMock = jest.fn().mockResolvedValue({ data: { user }, error: null })
  const rpc = jest.fn()
  ;(createClient as jest.Mock).mockResolvedValue({ auth: { getUser: getUserMock }, rpc })
  return { getUserMock, rpc }
}

beforeEach(() => jest.resetAllMocks())

describe('getUser', () => {
  it('returns the signed-in user', async () => {
    mockAuth(USER)
    await expect(getUser()).resolves.toEqual(USER)
  })

  it('returns null when there is no session', async () => {
    mockAuth(null)
    await expect(getUser()).resolves.toBeNull()
  })

  it('returns null when the auth client throws', async () => {
    ;(createClient as jest.Mock).mockRejectedValue(new Error('cookies unavailable'))
    await expect(getUser()).resolves.toBeNull()
  })
})

describe('getAuthAndRole', () => {
  it('reports the league role for a signed-in member', async () => {
    mockAuth(USER)
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => queryReturning({ role: 'admin' })),
    })
    await expect(getAuthAndRole(LEAGUE)).resolves.toEqual({
      user: USER,
      userRole: 'admin',
      isAuthenticated: true,
    })
  })

  it('reports unauthenticated when there is no user', async () => {
    mockAuth(null)
    await expect(getAuthAndRole(LEAGUE)).resolves.toEqual({
      user: null,
      userRole: null,
      isAuthenticated: false,
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/__tests__/fetchers.test.ts`
Expected: FAIL. The `getUser` suite fails with `getUser is not a function` (it is not exported yet). The `getAuthAndRole` suite may pass already; that is fine.

- [ ] **Step 3: Add `getAuthClient` and `getUser`, and rewire `getAuthAndRole`**

In `lib/fetchers.ts`, replace the `// ── Auth + role` section (the whole `getAuthAndRole` definition) with:

```ts
// ── Auth client + user ────────────────────────────────────────────────────────

// One cookie-backed auth client per request. Creating it is cheap, but sharing
// it keeps every auth-dependent fetcher on the same instance.
export const getAuthClient = cache(async () => createClient())

// One call to Supabase Auth per request. Every fetcher that needs the current
// user goes through here so a page never pays for the auth round trip twice.
export const getUser = cache(async () => {
  try {
    const authSupabase = await getAuthClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    return user
  } catch {
    return null
  }
})

// ── Auth + role ───────────────────────────────────────────────────────────────

export const getAuthAndRole = cache(async (leagueId: string) => {
  try {
    const user = await getUser()
    if (!user) return { user: null, userRole: null as GameRole | null, isAuthenticated: false }
    // Sequential by necessity: user.id is required to look up the league role.
    const service = createServiceClient()
    const { data: memberRow } = await service
      .from('game_members')
      .select('role')
      .eq('game_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle()
    return {
      user,
      userRole: (memberRow?.role ?? null) as GameRole | null,
      isAuthenticated: true,
    }
  } catch {
    return { user: null, userRole: null as GameRole | null, isAuthenticated: false }
  }
})
```

- [ ] **Step 4: Rewire the three other `auth.getUser()` callers**

Still in `lib/fetchers.ts`:

Replace the body of `getPendingJoinRequests` with:

```ts
export const getPendingJoinRequests = cache(async (leagueId: string): Promise<PendingJoinRequest[]> => {
  try {
    const user = await getUser()
    if (!user) return []
    const authSupabase = await getAuthClient()
    const { data, error } = await authSupabase.rpc('get_join_requests', {
      p_game_id: leagueId,
    })
    if (error) return []
    return (data ?? []) as PendingJoinRequest[]
  } catch {
    return []
  }
})
```

Replace the body of `getPendingClaimCount` with:

```ts
export const getPendingClaimCount = cache(async (leagueId: string): Promise<number> => {
  try {
    const user = await getUser()
    if (!user) return 0
    const authSupabase = await getAuthClient()
    const { data, error } = await authSupabase.rpc('get_player_claims', { p_game_id: leagueId })
    if (error) return 0
    const claims = (data ?? []) as { status: string }[]
    return claims.filter((c) => c.status === 'pending').length
  } catch {
    return 0
  }
})
```

Replace the body of `getMyClaimInfo` with (the public short-circuit is added in Task 4; for now only the auth wiring changes):

```ts
export const getMyClaimInfo = cache(async (leagueId: string): Promise<{
  status: PlayerClaimStatus | 'none'
  playerName: string | null
}> => {
  try {
    const user = await getUser()
    if (!user) return { status: 'none', playerName: null }
    const authSupabase = await getAuthClient()
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

- [ ] **Step 5: Confirm no direct `auth.getUser()` remains in the fetchers**

Run: `grep -n "auth.getUser()" lib/fetchers.ts`
Expected: exactly one line, inside `getUser`.

- [ ] **Step 6: Run the tests and type-check**

Run: `npm test -- lib/__tests__/fetchers.test.ts && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/fetchers.ts lib/__tests__/fetchers.test.ts
git commit -m "Share one cached Supabase Auth lookup across all league fetchers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Skip the admin badge RPCs for non-admins

**Files:**
- Modify: `lib/fetchers.ts` (`getPendingBadgeCount`)
- Modify: `lib/__tests__/fetchers.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `lib/__tests__/fetchers.test.ts`. Also extend the import line at the top to `import { getUser, getAuthAndRole, getPendingBadgeCount } from '@/lib/fetchers'`.

```ts
describe('getPendingBadgeCount', () => {
  it('returns 0 for a plain member without calling either admin RPC', async () => {
    const { rpc } = mockAuth(USER)
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => queryReturning({ role: 'member' })),
    })
    await expect(getPendingBadgeCount(LEAGUE)).resolves.toBe(0)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns 0 for a signed-out visitor without calling either admin RPC', async () => {
    const { rpc } = mockAuth(null)
    await expect(getPendingBadgeCount(LEAGUE)).resolves.toBe(0)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sums pending join requests and pending claims for an admin', async () => {
    const { rpc } = mockAuth(USER)
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => queryReturning({ role: 'admin' })),
    })
    rpc.mockImplementation((name: string) => {
      if (name === 'get_join_requests') return Promise.resolve({ data: [{}, {}], error: null })
      if (name === 'get_player_claims') return Promise.resolve({ data: [{ status: 'pending' }, { status: 'approved' }], error: null })
      return Promise.resolve({ data: null, error: { message: 'unknown rpc' } })
    })
    await expect(getPendingBadgeCount(LEAGUE)).resolves.toBe(3)
  })
})
```

- [ ] **Step 2: Run the tests to verify the member case fails**

Run: `npm test -- lib/__tests__/fetchers.test.ts`
Expected: the "plain member" test FAILS on `expect(rpc).not.toHaveBeenCalled()`. The other two may already pass.

- [ ] **Step 3: Gate the badge count on role**

In `lib/fetchers.ts`, replace `getPendingBadgeCount` with:

```ts
// Combined badge count for the admin settings gear: pending join requests + pending claims.
// Only admins can see the gear, and both RPCs deny non-admins anyway, so skip
// the two round trips unless the cached role says admin or creator.
export const getPendingBadgeCount = cache(async (leagueId: string): Promise<number> => {
  const { userRole } = await getAuthAndRole(leagueId)
  if (userRole !== 'admin' && userRole !== 'creator') return 0
  const [joinCount, claimCount] = await Promise.all([
    getPendingJoinCount(leagueId),
    getPendingClaimCount(leagueId),
  ])
  return joinCount + claimCount
})
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- lib/__tests__/fetchers.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/fetchers.ts lib/__tests__/fetchers.test.ts
git commit -m "Skip admin badge RPCs for non-admin visitors

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Self-sufficient `getMyJoinRequestStatus` and public short-circuit in `getMyClaimInfo`

**Files:**
- Modify: `lib/fetchers.ts`
- Modify: `lib/__tests__/fetchers.test.ts`

- [ ] **Step 1: Write the failing tests**

Extend the import line to `import { getUser, getAuthAndRole, getPendingBadgeCount, getMyJoinRequestStatus, getMyClaimInfo } from '@/lib/fetchers'`. Append:

```ts
describe('getMyJoinRequestStatus', () => {
  it('returns null when signed out', async () => {
    mockAuth(null)
    await expect(getMyJoinRequestStatus(LEAGUE)).resolves.toBeNull()
  })

  it("returns 'member' for anyone with a league role", async () => {
    mockAuth(USER)
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => queryReturning({ role: 'member' })),
    })
    await expect(getMyJoinRequestStatus(LEAGUE)).resolves.toBe('member')
  })

  it('returns the join request status for a signed-in non-member', async () => {
    mockAuth(USER)
    const from = jest.fn((table: string) =>
      table === 'game_members'
        ? queryReturning(null)
        : queryReturning({ status: 'pending' })
    )
    ;(createServiceClient as jest.Mock).mockReturnValue({ from })
    await expect(getMyJoinRequestStatus(LEAGUE)).resolves.toBe('pending')
    expect(from).toHaveBeenCalledWith('game_join_requests')
  })

  it("returns 'none' for a signed-in non-member with no request", async () => {
    mockAuth(USER)
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => queryReturning(null)),
    })
    await expect(getMyJoinRequestStatus(LEAGUE)).resolves.toBe('none')
  })
})

describe('getMyClaimInfo', () => {
  it('short-circuits for a signed-in non-member without querying player_claims', async () => {
    mockAuth(USER)
    const from = jest.fn(() => queryReturning(null))
    ;(createServiceClient as jest.Mock).mockReturnValue({ from })
    const authFrom = jest.fn()
    ;(createClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: USER }, error: null }) },
      from: authFrom,
      rpc: jest.fn(),
    })
    await expect(getMyClaimInfo(LEAGUE)).resolves.toEqual({ status: 'none', playerName: null })
    expect(authFrom).not.toHaveBeenCalled()
  })

  it('returns the approved player name for a member', async () => {
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => queryReturning({ role: 'member' })),
    })
    ;(createClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: USER }, error: null }) },
      from: jest.fn(() => queryReturning({ status: 'approved', admin_override_name: null, player_name: 'Dev' })),
      rpc: jest.fn(),
    })
    await expect(getMyClaimInfo(LEAGUE)).resolves.toEqual({ status: 'approved', playerName: 'Dev' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/__tests__/fetchers.test.ts`
Expected: `getMyJoinRequestStatus` suite fails with "is not a function"; the `getMyClaimInfo` short-circuit test fails on `expect(authFrom).not.toHaveBeenCalled()`.

- [ ] **Step 3: Add `getMyJoinRequestStatus`**

In `lib/fetchers.ts`, directly after the existing `getJoinRequestStatus` function, add:

```ts
// The join/share button state for the current visitor, resolved entirely from
// the request's cached auth state so pages can run it in their parallel batch.
//   null      → signed out (page shows Join → AuthDialog)
//   'member'  → has a league role (page shows Share)
//   otherwise → the visitor's join request status
export const getMyJoinRequestStatus = cache(async (
  leagueId: string
): Promise<JoinRequestStatus | 'member' | null> => {
  const { user, userRole, isAuthenticated } = await getAuthAndRole(leagueId)
  if (!isAuthenticated || !user) return null
  if (userRole !== null) return 'member'
  return getJoinRequestStatus(leagueId, user.id)
})
```

- [ ] **Step 4: Add the public short-circuit to `getMyClaimInfo`**

In `getMyClaimInfo`, replace the first two lines of the `try` block:

```ts
    const user = await getUser()
    if (!user) return { status: 'none', playerName: null }
```

with:

```ts
    // Claims only exist for members. Non-members (public tier) skip the query.
    const { user, userRole } = await getAuthAndRole(leagueId)
    if (!user || userRole === null) return { status: 'none', playerName: null }
```

- [ ] **Step 5: Run the tests and type-check**

Run: `npm test -- lib/__tests__/fetchers.test.ts && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/fetchers.ts lib/__tests__/fetchers.test.ts
git commit -m "Add getMyJoinRequestStatus and skip claim lookup for non-members

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Stop the league layout blocking on warm-up fetches

**Files:**
- Modify: `app/[slug]/layout.tsx`

- [ ] **Step 1: Replace the awaited warm-up**

In `app/[slug]/layout.tsx`, replace:

```ts
  await Promise.all([
    getAuthAndRole(game.id),
    getFeatures(game.id),
  ])

  return <>{children}</>
```

with:

```ts
  // Warm the per-request cache without blocking. React cache() memoises the
  // in-flight promise, so the page's own calls join these rather than
  // re-fetching, and the layout renders as soon as the slug resolves — which
  // is what lets each tab's loading.tsx appear promptly.
  void getAuthAndRole(game.id)
  void getFeatures(game.id)

  return <>{children}</>
```

Also update the comment above `let game = await getGameBySlug(slug)` from "Pre-warm all shared fetchers in parallel." to "Warm shared fetchers without awaiting them."

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add 'app/[slug]/layout.tsx'
git commit -m "Warm league fetchers in the layout without blocking render

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Run every fetch in one batch on the four tab pages

**Files:**
- Modify: `app/[slug]/results/page.tsx`
- Modify: `app/[slug]/players/page.tsx`
- Modify: `app/[slug]/honours/page.tsx`
- Modify: `app/[slug]/lineup-lab/page.tsx`

The same edit is applied to each page. The rendered JSX in every page is untouched.

- [ ] **Step 1: Results page**

In `app/[slug]/results/page.tsx`:

Change the fetchers import to:

```ts
import { getGameBySlug, getAuthAndRole, getFeatures, getPlayerStats, getWeeks, getMyJoinRequestStatus, getPendingBadgeCount, getMyClaimInfo } from '@/lib/fetchers'
```

Replace everything from the comment `// getAuthAndRole and getFeatures are cache hits from the layout.` down to and including the closing brace of the `if (tier !== 'public') { ... }` claim block (i.e. through `if (tier === 'member') showClaimBanner = status === 'none'` and its `}`) with:

```ts
  // Everything below is independent given leagueId, so it runs in one batch.
  // getAuthAndRole and getFeatures are already in flight from the layout.
  const [
    { userRole, isAuthenticated },
    features,
    players,
    rawWeeks,
    pendingRequestCount,
    joinStatus,
    claim,
  ] = await Promise.all([
    getAuthAndRole(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
    getPendingBadgeCount(leagueId),   // 0 for non-admins, no RPCs
    getMyJoinRequestStatus(leagueId), // null | 'member' | JoinRequestStatus
    getMyClaimInfo(leagueId),         // 'none' for non-members, no query
  ])

  const tier = resolveVisibilityTier(userRole)
  const isAdmin = tier === 'admin'

  // Onboarding banner for members with no claim; linked name for the sidebar.
  const linkedPlayerName = claim.playerName
  const showClaimBanner = tier === 'member' && claim.status === 'none'
```

Then delete the now-unused import of `JoinRequestStatus` from the `import type { Week, ScheduledWeek, LeagueDetails, JoinRequestStatus } from '@/lib/types'` line so it reads `import type { Week, ScheduledWeek, LeagueDetails } from '@/lib/types'`.

Note: the original code had `const tier = ...` and `const isAdmin = ...` between the join-status block and the claim block, with a `// game is guaranteed non-null` comment. Those lines are included in the replacement above, so make sure they are not duplicated.

- [ ] **Step 2: Players page**

In `app/[slug]/players/page.tsx`, make the same three edits:

Import line:
```ts
import { getGameBySlug, getAuthAndRole, getFeatures, getPlayerStats, getWeeks, getMyJoinRequestStatus, getPendingBadgeCount, getMyClaimInfo } from '@/lib/fetchers'
```

Replace from `// getAuthAndRole and getFeatures are cache hits from the layout.` through the end of the `if (tier !== 'public') { ... }` block with:

```ts
  // Everything below is independent given leagueId, so it runs in one batch.
  // getAuthAndRole and getFeatures are already in flight from the layout.
  const [
    { userRole },
    features,
    players,
    weeks,
    pendingRequestCount,
    joinStatus,
    claim,
  ] = await Promise.all([
    getAuthAndRole(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
    getPendingBadgeCount(leagueId),
    getMyJoinRequestStatus(leagueId),
    getMyClaimInfo(leagueId),
  ])

  const tier = resolveVisibilityTier(userRole)
  const isAdmin = tier === 'admin'

  if (!isAdmin && !isFeatureEnabled(features, 'player_stats', tier)) {
    return <LeaguePrivateState leagueName={game.name} />
  }

  // Onboarding banner for members with no claim; linked name for the sidebar.
  const linkedPlayerName = claim.playerName
  const showClaimBanner = tier === 'member' && claim.status === 'none'
```

Careful: in this page the `LeaguePrivateState` early return sat between the tier lines and the claim block. It is included above; do not duplicate it.

Type import becomes `import type { LeagueDetails } from '@/lib/types'`.

- [ ] **Step 3: Honours page**

In `app/[slug]/honours/page.tsx`:

Import line:
```ts
import { getGameBySlug, getAuthAndRole, getFeatures, getPlayerStats, getWeeks, getMyJoinRequestStatus, getPendingBadgeCount, getMyClaimInfo } from '@/lib/fetchers'
```

Replace from `// getAuthAndRole and getFeatures are cache hits from the layout.` through the end of the `if (tier !== 'public') { ... }` block with:

```ts
  // Everything below is independent given leagueId, so it runs in one batch.
  // getAuthAndRole and getFeatures are already in flight from the layout.
  const [
    { userRole, isAuthenticated },
    ,
    players,
    weeks,
    pendingRequestCount,
    joinStatus,
    claim,
  ] = await Promise.all([
    getAuthAndRole(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
    getPendingBadgeCount(leagueId),
    getMyJoinRequestStatus(leagueId),
    getMyClaimInfo(leagueId),
  ])

  const tier = resolveVisibilityTier(userRole)
  const isAdmin = tier === 'admin'

  // Onboarding banner for members with no claim; linked name for the sidebar.
  const linkedPlayerName = claim.playerName
  const showClaimBanner = tier === 'member' && claim.status === 'none'
```

The honours page never reads `features`, hence the elided destructuring slot. Keep `getFeatures` in the batch so the layout's warm-up is joined rather than orphaned.

Type import becomes `import type { LeagueDetails } from '@/lib/types'`.

- [ ] **Step 4: Lineup Lab page**

In `app/[slug]/lineup-lab/page.tsx`:

Import line:
```ts
import { getGameBySlug, getAuthAndRole, getFeatures, getPlayerStats, getWeeks, getMyJoinRequestStatus, getPendingBadgeCount } from '@/lib/fetchers'
```

Replace from `// getAuthAndRole and getFeatures are cache hits from the layout.` through the closing brace of the `if (!isAuthenticated) { ... } else { ... }` join-status block with:

```ts
  // Everything below is independent given leagueId, so it runs in one batch.
  // getAuthAndRole and getFeatures are already in flight from the layout.
  const [
    { userRole, isAuthenticated },
    ,
    players,
    weeks,
    pendingRequestCount,
    joinStatus,
  ] = await Promise.all([
    getAuthAndRole(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
    getPendingBadgeCount(leagueId),
    getMyJoinRequestStatus(leagueId),
  ])
```

Leave the existing `const tier = ...` and `const isAdmin = ...` lines that follow. Type import becomes `import type { LeagueDetails } from '@/lib/types'`.

- [ ] **Step 5: Confirm nothing still calls the old sequential helpers from pages**

Run: `grep -rn "getJoinRequestStatus\|tier !== 'public'" app/\[slug\]/*/page.tsx`
Expected: no output.

- [ ] **Step 6: Type-check, lint and build**

Run: `npx tsc --noEmit && npm run lint && npx next build 2>&1 | tail -5`
Expected: no type errors, no lint errors (an unused-variable warning would indicate a leftover `user` or `JoinRequestStatus` import; fix it), build ends with the route table and no error.

- [ ] **Step 7: Commit**

```bash
git add 'app/[slug]/results/page.tsx' 'app/[slug]/players/page.tsx' 'app/[slug]/honours/page.tsx' 'app/[slug]/lineup-lab/page.tsx'
git commit -m "Fetch league tab data in a single parallel batch

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `LeagueTabSkeleton` component

**Files:**
- Create: `components/LeagueTabSkeleton.tsx`
- Create: `__tests__/league-tab-skeleton.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/league-tab-skeleton.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { LeagueTabSkeleton } from '@/components/LeagueTabSkeleton'

describe('LeagueTabSkeleton', () => {
  it('renders all four tab labels', () => {
    render(<LeagueTabSkeleton tab="results" />)
    for (const label of ['Results', 'Players', 'Honours', 'Lineup Lab']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('marks only the requested tab as current', () => {
    render(<LeagueTabSkeleton tab="honours" />)
    const current = screen.getAllByRole('listitem').filter((el) => el.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent('Honours')
  })

  it('announces itself as busy to assistive tech', () => {
    render(<LeagueTabSkeleton tab="players" />)
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- __tests__/league-tab-skeleton.test.tsx`
Expected: FAIL with "Cannot find module '@/components/LeagueTabSkeleton'".

- [ ] **Step 3: Create the component**

Create `components/LeagueTabSkeleton.tsx`:

```tsx
import { ClipboardList, Users, Trophy, FlaskConical } from 'lucide-react'
import { cn } from '@/lib/utils'

type LeagueTab = 'results' | 'players' | 'honours' | 'lineup-lab'

const TABS: { key: LeagueTab; label: string; Icon: typeof ClipboardList }[] = [
  { key: 'results', label: 'Results', Icon: ClipboardList },
  { key: 'players', label: 'Players', Icon: Users },
  { key: 'honours', label: 'Honours', Icon: Trophy },
  { key: 'lineup-lab', label: 'Lineup Lab', Icon: FlaskConical },
]

function Block({ className }: { className?: string }) {
  return <div className={cn('rounded-md bg-slate-800 animate-pulse', className)} />
}

/**
 * Instant placeholder for the four league tab pages. Mirrors the real page
 * structure (header, info bar, tab nav, content cards, desktop sidebar) so
 * nothing shifts when the real content streams in. The tab nav is real text
 * with the active tab underlined, so a click visibly "lands" before any data
 * arrives.
 */
export function LeagueTabSkeleton({ tab }: { tab: LeagueTab }) {
  return (
    <main className="px-4 sm:px-6 pt-4 pb-8" aria-busy="true">
      <div className="flex justify-center gap-6 items-start">
        <div className="w-full max-w-xl shrink-0">
          {/* Header: title + subtitle on the left, join/share button on the right */}
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <div>
                <Block className="h-8 w-48" />
                <Block className="mt-2 h-3 w-40" />
              </div>
              <Block className="h-9 w-20" />
            </div>
            <div className="mt-3">
              <Block className="h-10 w-full rounded-lg" />
            </div>
            <ul className="flex gap-6 overflow-x-auto border-b border-slate-700 pt-5 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {TABS.map(({ key, label, Icon }) => (
                <li
                  key={key}
                  aria-current={tab === key ? 'page' : undefined}
                  className={cn(
                    '-mb-px flex shrink-0 items-center gap-2 border-b-2 pb-2 text-sm font-medium whitespace-nowrap',
                    tab === key
                      ? 'border-slate-200 text-slate-200'
                      : 'border-transparent text-slate-400'
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          {/* Content cards */}
          <div className="flex flex-col gap-3">
            <Block className="h-24 rounded-lg" />
            <Block className="h-24 rounded-lg" />
            <Block className="h-24 rounded-lg" />
          </div>
        </div>

        {/* Desktop sidebar — same visibility rule as SidebarSticky */}
        <div className="hidden lg:block w-72 shrink-0 space-y-3">
          <Block className="h-40 rounded-lg" />
          <Block className="h-56 rounded-lg" />
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- __tests__/league-tab-skeleton.test.tsx`
Expected: all three PASS.

- [ ] **Step 5: Commit**

```bash
git add components/LeagueTabSkeleton.tsx __tests__/league-tab-skeleton.test.tsx
git commit -m "Add LeagueTabSkeleton loading placeholder

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `loading.tsx` per tab

**Files:**
- Create: `app/[slug]/results/loading.tsx`
- Create: `app/[slug]/players/loading.tsx`
- Create: `app/[slug]/honours/loading.tsx`
- Create: `app/[slug]/lineup-lab/loading.tsx`

- [ ] **Step 1: Create the four files**

`app/[slug]/results/loading.tsx`:
```tsx
import { LeagueTabSkeleton } from '@/components/LeagueTabSkeleton'

export default function Loading() {
  return <LeagueTabSkeleton tab="results" />
}
```

`app/[slug]/players/loading.tsx`:
```tsx
import { LeagueTabSkeleton } from '@/components/LeagueTabSkeleton'

export default function Loading() {
  return <LeagueTabSkeleton tab="players" />
}
```

`app/[slug]/honours/loading.tsx`:
```tsx
import { LeagueTabSkeleton } from '@/components/LeagueTabSkeleton'

export default function Loading() {
  return <LeagueTabSkeleton tab="honours" />
}
```

`app/[slug]/lineup-lab/loading.tsx`:
```tsx
import { LeagueTabSkeleton } from '@/components/LeagueTabSkeleton'

export default function Loading() {
  return <LeagueTabSkeleton tab="lineup-lab" />
}
```

- [ ] **Step 2: Build**

Run: `npx next build 2>&1 | tail -5`
Expected: build succeeds. No new warnings.

- [ ] **Step 3: Commit**

```bash
git add 'app/[slug]/results/loading.tsx' 'app/[slug]/players/loading.tsx' 'app/[slug]/honours/loading.tsx' 'app/[slug]/lineup-lab/loading.tsx'
git commit -m "Show a tab skeleton instantly while league pages render

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Browser check of the skeleton

**Files:** none

- [ ] **Step 1: Start the production build**

Run:
```bash
(npx next start -p 3123 > .context/next-start.log 2>&1 &); sleep 3; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3123/craft-football/results
```
Expected: `200`.

- [ ] **Step 2: Verify in the browser**

Open `http://localhost:3123/craft-football/results` in Chrome (signed out is fine). Throttle the network to "Slow 3G" in DevTools so the skeleton is visible. Click **Players**, then **Honours**, then **Lineup Lab**.

Confirm for each click:
- The page changes immediately to the skeleton, with the clicked tab underlined.
- When content arrives, the header, tab bar and content occupy the same positions (no jump).
- The rendered page matches what it showed before this branch.

Save a screenshot of the skeleton state to `.context/skeleton-honours.png`.

- [ ] **Step 3: Stop the server**

Run: `pkill -f next-server; sleep 1; pgrep -fl next-server || echo stopped`
Expected: `stopped`.

---

### Task 10: Full verification and timing comparison

**Files:** none

- [ ] **Step 1: Full test, lint, type-check and build**

Run: `npm test 2>&1 | tail -8 && npm run lint && npx tsc --noEmit && npx next build 2>&1 | tail -3`
Expected: all suites pass, no lint errors, no type errors, build succeeds.

- [ ] **Step 2: Time the tabs after the changes**

Run:
```bash
(npx next start -p 3123 > .context/next-start.log 2>&1 &); sleep 3
for pass in 1 2 3; do for tab in results players honours lineup-lab; do curl -s -o /dev/null -w "pass $pass  %{time_starttransfer}s  $tab\n" "http://localhost:3123/craft-football/$tab"; done; done | tee .context/timing-after.txt
pkill -f next-server; sleep 1
paste .context/timing-before.txt .context/timing-after.txt
```
Expected: signed-out times are similar to or slightly better than before. The signed-out path had few of the removed calls, so a small change here is expected; the large gains are on the signed-in path and from the region move, neither of which is measurable locally. Record both columns in the PR description.

- [ ] **Step 3: Confirm the working tree is clean and list the commits**

Run: `git status --short && git log --oneline origin/main..HEAD`
Expected: no uncommitted changes; ten commits (spec, plan, region, three fetcher commits, layout, pages, skeleton, loading files).

---

## After merge (not part of this plan)

- Confirm in the Vercel dashboard that the deployment shows region `dub1`.
- Compare function durations for `/[slug]/honours` before and after. If a first hit is still several seconds while subsequent hits are fast, that is a cold start; enable Fluid compute in the Vercel project settings.
