# Platform Admin Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private `/platform` area where three named accounts can see every league, how it is being used, and delete one.

**Architecture:** Access is a list of user ids in the server-only `PLATFORM_ADMIN_IDS` variable, checked in every page and route; everyone else gets a 404. All cross-league reads and the delete run on the server with the service-role client, through two SQL functions only the service role may execute. No RLS policy changes.

**Tech Stack:** Next.js 16 App Router, Supabase (service-role client, SQL functions), Tailwind v4, Jest.

**Spec:** `docs/superpowers/specs/2026-11-17-platform-admin-portal-design.md`

## Ground rules

- Read `CLAUDE.md` first. British English, no em dashes in UI copy, Tailwind classes only, `cn()` for conditional classes.
- Local dev points at the **production** Supabase project. Do not run the migration, do not call the delete route against a real league, and browse signed out.
- Migrations are applied by hand in the Supabase SQL editor. This plan writes the file; Will runs it (Task 8).
- Checks before calling anything done: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## File map

| File | Job |
|---|---|
| `supabase/migrations/20261117000002_platform_admin.sql` (new) | Audit table, two functions, reserved slug, drop `profiles.role` |
| `lib/platform.ts` (new) | `isPlatformAdmin` and the dashboard's pure sums |
| `lib/types.ts` | `PlatformLeague`; `NavSession.platformAdmin` |
| `lib/apiAuth.ts` | `requirePlatformAdmin()` |
| `lib/leagueApi.ts` | `deletePlatformLeague()` browser call |
| `lib/fetchers.ts` | `getNavSession` sets `platformAdmin` |
| `app/api/platform/leagues/[id]/route.ts` (new) | `DELETE` |
| `components/LeagueList.tsx` | Export the existing `Tag` and `Cell` |
| `components/platform/ui.tsx` (new) | `CARD`, `LABEL`, `Section`, `StatusTag` |
| `components/platform/DeleteLeague.tsx` (new) | Danger zone card and confirm dialog |
| `app/platform/page.tsx` (new) | Dashboard |
| `app/platform/[id]/page.tsx` (new) | League detail |
| `__tests__/platform-pages.test.tsx` (new) | Page-level gate and render checks for both pages |
| `components/ui/navbar.tsx` | Radar button and mobile link |
| `CLAUDE.md`, `.env.example` | Document the route and variable |
| `app/new/mock-platform/` | Delete (design mock; copy kept in `.context/`) |

---

### Task 1: Migration file

**Files:**
- Create: `supabase/migrations/20261117000002_platform_admin.sql`

`20261117000001` is taken by the `is_game_admin` migration in PR #206.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20261117000002_platform_admin.sql
--
-- The platform admin portal at /platform. Who may open it is decided by the
-- app (PLATFORM_ADMIN_IDS on the server), never by the database, so nothing
-- here is reachable with a user's own session:
--
--   1. platform_audit_log: what platform admins did, with a snapshot of
--      anything deleted. Service role only.
--   2. platform_leagues(): one row per league with its counts.
--   3. platform_delete_league(): snapshot, then delete, in one transaction.
--   4. 'platform' joins the reserved league addresses.
--   5. profiles.role goes. Nothing read it, and any signed-in user could set
--      their own to 'developer' through the "Users update own profile" policy.
--
-- Both functions run with the caller's rights, so if a grant ever slipped,
-- RLS would still stand between a user and other leagues' data.
-- Safe to run twice.

-- ── 1. Audit log ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action      text NOT NULL,
  actor_id    uuid,
  -- Copied at write time so the entry survives the actor's account.
  actor_email text,
  game_id     uuid,
  game_slug   text,
  game_name   text,
  snapshot    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS on with no policies: no user session can read or write a row.
ALTER TABLE platform_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_audit_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON platform_audit_log TO service_role;

-- ── 2. platform_leagues ──────────────────────────────────────────────────────
-- "Results" are weeks that were played or abandoned (dnf). "Last activity" is
-- the newest week row; weeks carry no updated timestamp.
CREATE OR REPLACE FUNCTION public.platform_leagues()
RETURNS TABLE (
  id            uuid,
  name          text,
  slug          text,
  created_at    timestamptz,
  location      text,
  day           text,
  kickoff_time  text,
  creator_name  text,
  creator_email text,
  members       int,
  players       int,
  results       int,
  last_activity timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT g.id, g.name, g.slug, g.created_at, g.location, g.day, g.kickoff_time,
         coalesce(
           nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
           nullif(trim(p.display_name), '')
         ),
         p.email,
         (SELECT count(*)::int FROM game_members m WHERE m.game_id = g.id),
         (SELECT count(*)::int FROM player_attributes a WHERE a.game_id = g.id),
         (SELECT count(*)::int FROM weeks w WHERE w.game_id = g.id AND w.status IN ('played', 'dnf')),
         (SELECT max(w.created_at) FROM weeks w WHERE w.game_id = g.id)
    FROM games g
    LEFT JOIN profiles p ON p.id = g.created_by
   ORDER BY g.created_at DESC;
$$;

-- Supabase grants EXECUTE on new functions to every role, so take it back.
REVOKE ALL ON FUNCTION public.platform_leagues() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_leagues() TO service_role;

-- ── 3. platform_delete_league ────────────────────────────────────────────────
-- Every table that references games cascades on delete (checked against
-- production on 2026-11-17), so deleting the games row removes the lot. The
-- snapshot lists those same ten tables; add any new one here too.
CREATE OR REPLACE FUNCTION public.platform_delete_league(p_game_id uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_game games%ROWTYPE;
BEGIN
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  INSERT INTO platform_audit_log (action, actor_id, actor_email, game_id, game_slug, game_name, snapshot)
  VALUES (
    'delete_league',
    p_actor,
    (SELECT email FROM profiles WHERE id = p_actor),
    v_game.id,
    v_game.slug,
    v_game.name,
    jsonb_build_object(
      'games',              to_jsonb(v_game),
      'game_members',       (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM game_members t       WHERE t.game_id = p_game_id),
      'game_invites',       (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM game_invites t       WHERE t.game_id = p_game_id),
      'weeks',              (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM weeks t              WHERE t.game_id = p_game_id),
      'config',             (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM config t             WHERE t.game_id = p_game_id),
      'league_features',    (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM league_features t    WHERE t.game_id = p_game_id),
      'player_attributes',  (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM player_attributes t  WHERE t.game_id = p_game_id),
      'game_join_requests', (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM game_join_requests t WHERE t.game_id = p_game_id),
      'player_claims',      (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM player_claims t      WHERE t.game_id = p_game_id),
      'week_fees',          (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM week_fees t          WHERE t.game_id = p_game_id),
      'week_payments',      (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM week_payments t      WHERE t.game_id = p_game_id)
    )
  );

  DELETE FROM games WHERE id = p_game_id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_delete_league(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_delete_league(uuid, uuid) TO service_role;

-- ── 4. Reserve the address ───────────────────────────────────────────────────
-- Same constraint as 20261116000001 with 'platform' added.
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_slug_format;
ALTER TABLE games ADD CONSTRAINT games_slug_format CHECK (
  slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  AND char_length(slug) <= 100
  AND slug NOT IN ('api', 'app', 'auth', 'invite', 'new', 'platform', 'profile-required', 'results', 'settings', 'sign-in')
);

-- ── 5. Retire profiles.role ──────────────────────────────────────────────────
-- Its default and check constraint are the only things that depend on it
-- (checked against production on 2026-11-17) and go with the column.
ALTER TABLE profiles DROP COLUMN IF EXISTS role;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20261117000002_platform_admin.sql
git commit -m "Add the platform admin migration"
```

---

### Task 2: `lib/platform.ts` and types

**Files:**
- Create: `lib/platform.ts`
- Modify: `lib/types.ts` (append after the `NavSession` interface)
- Test: `lib/__tests__/platform.test.ts`

- [ ] **Step 1: Add the type**

In `lib/types.ts`, directly after the closing brace of `NavSession`:

```ts
/** One row of platform_leagues(): a league as the platform admin portal lists it. */
export interface PlatformLeague {
  id: string
  name: string
  slug: string
  created_at: string
  location: string | null
  day: string | null
  kickoff_time: string | null
  creator_name: string | null
  creator_email: string | null
  members: number
  players: number
  /** Weeks that were played or abandoned. */
  results: number
  /** When the newest week row was saved, or null with no weeks. */
  last_activity: string | null
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// lib/__tests__/platform.test.ts
import { countSince, daysAgo, formatDay, isPlatformAdmin, leagueStatus, platformMilestones } from '@/lib/platform'
import type { PlatformLeague } from '@/lib/types'

const NOW = new Date('2026-11-17T12:00:00Z')

function league(over: Partial<PlatformLeague>): PlatformLeague {
  return {
    id: 'g1', name: 'Thursday Night Fives', slug: 'thursday-night-fives-k7x', created_at: '2026-11-09T10:00:00Z',
    location: null, day: 'Thursday', kickoff_time: '18:30', creator_name: 'Marcus Reid', creator_email: 'marcus@example.com',
    members: 1, players: 1, results: 0, last_activity: null, ...over,
  }
}

describe('isPlatformAdmin', () => {
  const saved = process.env.PLATFORM_ADMIN_IDS
  afterEach(() => {
    if (saved === undefined) delete process.env.PLATFORM_ADMIN_IDS
    else process.env.PLATFORM_ADMIN_IDS = saved
  })

  it('lets nobody in while the variable is unset or empty', () => {
    delete process.env.PLATFORM_ADMIN_IDS
    expect(isPlatformAdmin('u1')).toBe(false)
    expect(isPlatformAdmin('')).toBe(false)
    process.env.PLATFORM_ADMIN_IDS = ''
    expect(isPlatformAdmin('')).toBe(false)
    process.env.PLATFORM_ADMIN_IDS = ' , '
    expect(isPlatformAdmin('')).toBe(false)
  })

  it('matches a listed id, ignoring spaces around the commas', () => {
    process.env.PLATFORM_ADMIN_IDS = 'u1, u2 ,u3'
    expect(isPlatformAdmin('u1')).toBe(true)
    expect(isPlatformAdmin('u2')).toBe(true)
    expect(isPlatformAdmin('u3')).toBe(true)
  })

  it('refuses an id that is not listed, or only part of one', () => {
    process.env.PLATFORM_ADMIN_IDS = 'u1,u22'
    expect(isPlatformAdmin('u2')).toBe(false)
    expect(isPlatformAdmin('u')).toBe(false)
  })
})

describe('leagueStatus', () => {
  it('is Not started with no results, however recent the last week', () => {
    expect(leagueStatus(league({ results: 0, last_activity: '2026-11-16T10:00:00Z' }), NOW)).toBe('Not started')
  })

  it('is Active when a week was saved within 28 days', () => {
    expect(leagueStatus(league({ results: 3, last_activity: '2026-10-20T12:00:00Z' }), NOW)).toBe('Active')
  })

  it('is Stalled when the last week is older than 28 days', () => {
    expect(leagueStatus(league({ results: 3, last_activity: '2026-10-20T11:59:59Z' }), NOW)).toBe('Stalled')
  })
})

describe('daysAgo and countSince', () => {
  it('gives the instant that many days before now', () => {
    expect(daysAgo(7, NOW)).toBe('2026-11-10T12:00:00.000Z')
  })

  it('counts dates on or after the cut-off and skips nulls', () => {
    const dates = ['2026-11-16T00:00:00Z', '2026-11-10T12:00:00Z', '2026-11-10T11:59:59Z', null]
    expect(countSince(dates, 7, NOW)).toBe(2)
    expect(countSince(dates, 30, NOW)).toBe(3)
  })
})

describe('platformMilestones', () => {
  it('counts the leagues that reached each milestone', () => {
    const leagues = [
      league({ id: 'a' }),
      league({ id: 'b', players: 10, results: 2 }),
      league({ id: 'c', players: 14, results: 9, members: 3 }),
    ]
    expect(platformMilestones(leagues)).toEqual([
      { label: 'Created', count: 3 },
      { label: 'Roster added', count: 2 },
      { label: 'First result', count: 2 },
      { label: 'Second member joined', count: 1 },
      { label: 'Four results', count: 1 },
    ])
  })
})

describe('formatDay', () => {
  it('writes the date on the league clock', () => {
    expect(formatDay('2026-11-09T10:00:00Z')).toBe('9 Nov 2026')
    // 23:30 UTC in July is already the next day in London.
    expect(formatDay('2026-07-01T23:30:00Z')).toBe('2 Jul 2026')
  })
})
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npm test -- lib/__tests__/platform.test.ts`
Expected: FAIL, "Cannot find module '@/lib/platform'".

- [ ] **Step 4: Write the module**

```ts
// lib/platform.ts
// The platform admin portal at /platform: who may open it, and the sums its
// dashboard shows. Access is a list of user ids in a server-only variable, so
// it cannot be granted through the database.
import type { PlatformLeague } from '@/lib/types'

const DAY_MS = 86_400_000

/** A league with results is Stalled once this many days pass without a week being saved. */
export const STALLED_AFTER_DAYS = 28

/** True when this user id is listed in PLATFORM_ADMIN_IDS. Unset or empty means nobody. */
export function isPlatformAdmin(userId: string): boolean {
  if (!userId) return false
  return (process.env.PLATFORM_ADMIN_IDS ?? '').split(',').some((id) => id.trim() === userId)
}

export type LeagueStatus = 'Active' | 'Stalled' | 'Not started'

export function leagueStatus(league: Pick<PlatformLeague, 'results' | 'last_activity'>, now = new Date()): LeagueStatus {
  if (league.results === 0) return 'Not started'
  const last = league.last_activity ? new Date(league.last_activity).getTime() : 0
  return now.getTime() - last <= STALLED_AFTER_DAYS * DAY_MS ? 'Active' : 'Stalled'
}

/** The instant `days` days before `now`, as an ISO string for a `created_at` filter. */
export function daysAgo(days: number, now = new Date()): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString()
}

/** How many of these timestamps fall within the last `days` days. */
export function countSince(dates: (string | null)[], days: number, now = new Date()): number {
  const from = daysAgo(days, now)
  return dates.filter((d) => d !== null && new Date(d).toISOString() >= from).length
}

/** How many leagues reached each setup milestone. Counts, not a funnel: a league can reach them in any order. */
export function platformMilestones(leagues: PlatformLeague[]): { label: string; count: number }[] {
  const count = (reached: (l: PlatformLeague) => boolean) => leagues.filter(reached).length
  return [
    { label: 'Created', count: leagues.length },
    // The creator is added as a player automatically, so a roster starts at two.
    { label: 'Roster added', count: count((l) => l.players >= 2) },
    { label: 'First result', count: count((l) => l.results >= 1) },
    { label: 'Second member joined', count: count((l) => l.members >= 2) },
    { label: 'Four results', count: count((l) => l.results >= 4) },
  ]
}

/** '9 Nov 2026', on the league clock. */
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test -- lib/__tests__/platform.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/platform.ts lib/types.ts lib/__tests__/platform.test.ts
git commit -m "Add the platform admin check and dashboard sums"
```

---

### Task 3: Gate and delete route

**Files:**
- Modify: `lib/apiAuth.ts`
- Create: `app/api/platform/leagues/[id]/route.ts`
- Test: `__tests__/api-platform-leagues.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/api-platform-leagues.test.ts
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { mockAuthNamespace } from '@/lib/__tests__/helpers/supabase-auth'
import { revalidateTag } from 'next/cache'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase/service', () => ({ createServiceClient: jest.fn() }))
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }))

import { DELETE } from '@/app/api/platform/leagues/[id]/route'

const ADMIN = { id: 'admin-1', email: 'admin@example.com' }
const OTHER = { id: 'user-2', email: 'other@example.com' }
const SLUG = 'thursday-night-fives-k7x'
const rpc = jest.fn()

/** Signs `user` in and makes the games look-up return `game`. */
function setup(user: typeof ADMIN | null, game: { slug: string } | null = { slug: SLUG }) {
  ;(createClient as jest.Mock).mockResolvedValue({ auth: mockAuthNamespace(user) })
  const query: Record<string, jest.Mock> = {}
  for (const m of ['select', 'eq']) query[m] = jest.fn(() => query)
  query.maybeSingle = jest.fn().mockResolvedValue({ data: game, error: null })
  ;(createServiceClient as jest.Mock).mockReturnValue({ from: jest.fn(() => query), rpc })
}

function del(body: unknown) {
  return DELETE(
    new Request('http://localhost/api/platform/leagues/g1', { method: 'DELETE', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: 'g1' }) },
  )
}

const saved = process.env.PLATFORM_ADMIN_IDS
beforeEach(() => {
  jest.resetAllMocks()
  process.env.PLATFORM_ADMIN_IDS = ADMIN.id
})
afterAll(() => {
  if (saved === undefined) delete process.env.PLATFORM_ADMIN_IDS
  else process.env.PLATFORM_ADMIN_IDS = saved
})

describe('DELETE /api/platform/leagues/[id]', () => {
  it.each([
    ['a signed-out caller', null],
    ['a signed-in user who is not a platform admin', OTHER],
  ])('answers 404 to %s without touching the database', async (_label, user) => {
    setup(user)
    const res = await del({ confirm: SLUG })
    expect(res.status).toBe(404)
    expect(createServiceClient).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('answers 404 to everyone while the variable is unset', async () => {
    delete process.env.PLATFORM_ADMIN_IDS
    setup(ADMIN)
    const res = await del({ confirm: SLUG })
    expect(res.status).toBe(404)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('answers 404 for a league that does not exist', async () => {
    setup(ADMIN, null)
    const res = await del({ confirm: SLUG })
    expect(res.status).toBe(404)
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['the wrong address', { confirm: 'thursday-night-fives' }],
    ['no address', {}],
    ['no body', null],
  ])('answers 400 for %s and deletes nothing', async (_label, body) => {
    setup(ADMIN)
    const res = await del(body)
    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('deletes through the database function once and revalidates the league', async () => {
    setup(ADMIN)
    rpc.mockResolvedValue({ data: null, error: null })
    const res = await del({ confirm: SLUG })
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('platform_delete_league', { p_game_id: 'g1', p_actor: ADMIN.id })
    expect(revalidateTag).toHaveBeenCalledWith('league:g1', { expire: 0 })
    expect(revalidateTag).toHaveBeenCalledWith(`league-slug:${SLUG}`, { expire: 0 })
  })

  it('keeps database detail out of a failure and does not revalidate', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    setup(ADMIN)
    rpc.mockResolvedValue({ data: null, error: { message: 'relation "platform_audit_log" does not exist' } })
    const res = await del({ confirm: SLUG })
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Could not delete the league. Try again.' })
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- __tests__/api-platform-leagues.test.ts`
Expected: FAIL, "Cannot find module '@/app/api/platform/leagues/[id]/route'".

- [ ] **Step 3: Add the gate**

In `lib/apiAuth.ts`, add the import beside the existing ones:

```ts
import { isPlatformAdmin } from '@/lib/platform'
```

and add after `requireLeagueAdmin`:

```ts
/**
 * The signed-in caller if they are a platform admin. Everyone else, signed
 * in or not, gets a 404, so the routes look like they do not exist.
 */
export async function requirePlatformAdmin(): Promise<AuthGate> {
  const supabase = await createClient()
  const user = await getSessionUser(supabase)
  if (!user || !isPlatformAdmin(user.id)) {
    return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  return { user }
}
```

- [ ] **Step 4: Write the route**

```ts
// app/api/platform/leagues/[id]/route.ts
import { NextResponse } from 'next/server'
import { requirePlatformAdmin, rpcErrorResponse } from '@/lib/apiAuth'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidateLeague } from '@/lib/leagueCache'

/**
 * DELETE — platform admins only. Body: { confirm: "<the league's address>" }.
 * platform_delete_league saves the league's rows to platform_audit_log and
 * deletes the league in one transaction; every child table cascades.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePlatformAdmin()
  if ('response' in gate) return gate.response
  const { id } = await params

  const body = (await req.json().catch(() => null)) as { confirm?: unknown } | null
  const service = createServiceClient()
  // An id that is not a uuid fails this look-up and lands on the 404 too.
  const { data: game } = await service.from('games').select('slug').eq('id', id).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (body?.confirm !== game.slug) {
    return NextResponse.json({ error: 'Type the league address to confirm.' }, { status: 400 })
  }

  const { error } = await service.rpc('platform_delete_league', { p_game_id: id, p_actor: gate.user.id })
  if (error) return rpcErrorResponse(error, 'Could not delete the league. Try again.')

  revalidateLeague(id, [game.slug])
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test -- __tests__/api-platform-leagues.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/apiAuth.ts "app/api/platform/leagues/[id]/route.ts" __tests__/api-platform-leagues.test.ts
git commit -m "Add the platform admin gate and league delete route"
```

---

### Task 4: Header button

**Files:**
- Modify: `lib/types.ts` (`NavSession`), `lib/fetchers.ts` (`getNavSession`), `components/ui/navbar.tsx`
- Test: `lib/__tests__/fetchers.test.ts`

- [ ] **Step 1: Update the fetcher tests**

In `lib/__tests__/fetchers.test.ts`, inside `describe('getNavSession', ...)`:

In the test "builds the display name and league roles for a signed-in user", add `platformAdmin: false,` to the expected object:

```ts
    expect(session).toEqual({
      userId: 'user-1',
      email: 'a@b.c',
      displayName: 'Ada Lovelace',
      leagues: [
        { slug: 'boot-room', name: 'Boot Room', role: 'admin' },
        { slug: 'sunday', name: 'Sunday Sevens', role: 'member' },
      ],
      platformAdmin: false,
    })
```

Add this test at the end of the same `describe`:

```ts
  it('marks a viewer listed in PLATFORM_ADMIN_IDS as a platform admin', async () => {
    const saved = process.env.PLATFORM_ADMIN_IDS
    process.env.PLATFORM_ADMIN_IDS = 'someone-else, user-1'
    try {
      mockAuth(USER)
      const profile = queryReturning({ first_name: 'Ada', last_name: 'Lovelace' })
      const memberships = {
        select: jest.fn(() => memberships),
        eq: jest.fn(() => memberships),
        overrideTypes: jest.fn().mockResolvedValue({ data: [], error: null }),
      }
      ;(createServiceClient as jest.Mock).mockReturnValue({
        from: jest.fn((table: string) => (table === 'profiles' ? profile : memberships)),
      })
      await expect(getNavSession()).resolves.toMatchObject({ platformAdmin: true })
    } finally {
      if (saved === undefined) delete process.env.PLATFORM_ADMIN_IDS
      else process.env.PLATFORM_ADMIN_IDS = saved
    }
  })
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test -- lib/__tests__/fetchers.test.ts -t getNavSession`
Expected: FAIL, the expected object has `platformAdmin` and the received one does not.

- [ ] **Step 3: Add the field**

In `lib/types.ts`, add to `NavSession` after `leagues`:

```ts
  /** True for the accounts in PLATFORM_ADMIN_IDS: the header shows them the Platform button. The list itself never leaves the server. */
  platformAdmin: boolean
```

In `lib/fetchers.ts`, add the import:

```ts
import { isPlatformAdmin } from '@/lib/platform'
```

and in `getNavSession`'s returned object, after `leagues: ...,`:

```ts
    platformAdmin: isPlatformAdmin(user.id),
```

- [ ] **Step 4: Run to see them pass**

Run: `npm test -- lib/__tests__/fetchers.test.ts -t getNavSession`
Expected: PASS.

- [ ] **Step 5: Add the button to the navbar**

In `components/ui/navbar.tsx`:

Change the icon import to:

```ts
import { Settings, LogOut, Plus, Radar } from 'lucide-react'
```

Desktop. Replace

```tsx
            <div className="flex items-center gap-0.5">
              <DropdownMenu>
```

with

```tsx
            <div className="flex items-center gap-1.5">
              {user.platformAdmin && (
                <Link
                  href="/platform"
                  title="Platform"
                  aria-label="Platform"
                  className="flex size-[34px] shrink-0 items-center justify-center rounded-full border border-[#223a5c] bg-[#0c1728] text-[#7dd3fc] transition-colors hover:border-[#38bdf8] focus-visible:border-[#38bdf8] focus-visible:outline-none"
                >
                  <Radar className="size-4" />
                </Link>
              )}
              <DropdownMenu>
```

Mobile sheet. Directly before the sheet's "Create a league" link (the `<Link href="/new" className="flex items-center gap-2 text-sm font-bold text-[#f4f9ff]"` one), add:

```tsx
                    {user.platformAdmin && (
                      <Link
                        href="/platform"
                        className="flex items-center gap-2 text-sm font-bold text-[#f4f9ff]"
                        onClick={() => setSheetOpen(false)}
                      >
                        <Radar className="size-4" />
                        Platform
                      </Link>
                    )}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no output. If a test or fixture builds a `NavSession` literal without `platformAdmin`, add `platformAdmin: false` to it.

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/fetchers.ts lib/__tests__/fetchers.test.ts components/ui/navbar.tsx
git commit -m "Show platform admins a Platform button in the header"
```

---

### Task 5: Shared pieces for the two pages

**Files:**
- Modify: `components/LeagueList.tsx`
- Create: `components/platform/ui.tsx`

- [ ] **Step 1: Export the existing tag and cell**

In `components/LeagueList.tsx`, change `function Tag(` to `export function Tag(` and `function Cell(` to `export function Cell(`. Nothing else changes.

- [ ] **Step 2: Write the shared pieces**

```tsx
// components/platform/ui.tsx
// Presentational pieces shared by the two platform admin pages.
import { Tag } from '@/components/LeagueList'
import type { LeagueStatus } from '@/lib/platform'

export const CARD = 'overflow-hidden rounded-xl border border-[#1b2c46] bg-[#0a1421]'
export const LABEL = 'font-plex text-[8.5px] font-bold uppercase tracking-[.16em] text-[#6f88a8]'

const STATUS_TONE = { Active: 'lime', Stalled: 'amber', 'Not started': 'muted' } as const

export function StatusTag({ status }: { status: LeagueStatus }) {
  // The wrapper stops the tag wrapping when a long league name squeezes it.
  return (
    <span className="flex shrink-0">
      <Tag tone={STATUS_TONE[status]}>{status}</Tag>
    </span>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="font-plex text-[10px] font-bold uppercase tracking-[.18em] text-[#8ba4c4]">{title}</h2>
      <div className="mt-2.5">{children}</div>
    </section>
  )
}

/** A muted dot for a value that does not exist yet. */
export const NONE = <span className="text-[#4f688a]">·</span>
```

- [ ] **Step 3: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add components/LeagueList.tsx components/platform/ui.tsx
git commit -m "Share the tag and cell with the platform pages"
```

---

### Task 6: Dashboard page

**Files:**
- Create: `app/platform/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// app/platform/page.tsx
// The platform admin dashboard. Anyone not in PLATFORM_ADMIN_IDS gets the
// ordinary 404. The check lives in the page, not a layout, because a layout
// does not re-run on every navigation.
export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { getUser } from '@/lib/fetchers'
import { createServiceClient } from '@/lib/supabase/service'
import { countSince, daysAgo, formatDay, isPlatformAdmin, leagueStatus, platformMilestones } from '@/lib/platform'
import { Cell } from '@/components/LeagueList'
import { CARD, LABEL, NONE, Section, StatusTag } from '@/components/platform/ui'
import { cn } from '@/lib/utils'
import type { PlatformLeague } from '@/lib/types'

export const metadata: Metadata = { title: 'Platform' }

interface AuditEntry {
  id: string
  actor_email: string | null
  game_name: string | null
  game_slug: string | null
  created_at: string
}

function Total({ label, value, week, month }: { label: string; value: number; week: number; month: number }) {
  return (
    <div className={cn(CARD, 'p-4')}>
      <p className={LABEL}>{label}</p>
      <p className="mt-2 text-[32px] font-bold leading-none tracking-[-.035em] text-[#f4f9ff]">{value}</p>
      <p className="mt-2.5 font-plex text-[10px] font-bold text-[#8ba4c4]">
        <span className="text-[#bef264]">+{week}</span> in 7 days · <span className="text-[#bef264]">+{month}</span> in 30 days
      </p>
    </div>
  )
}

export default async function PlatformPage() {
  const user = await getUser()
  if (!user || !isPlatformAdmin(user.id)) notFound()

  const service = createServiceClient()
  const accounts = () => service.from('profiles').select('id', { count: 'exact', head: true })
  const [leaguesRes, accountsRes, accountsWeekRes, accountsMonthRes, logRes] = await Promise.all([
    // shortcut: PostgREST returns at most 1,000 rows, so this lists the newest 1,000 leagues; add paging before then
    service.rpc('platform_leagues'),
    accounts(),
    accounts().gte('created_at', daysAgo(7)),
    accounts().gte('created_at', daysAgo(30)),
    service
      .from('platform_audit_log')
      .select('id, actor_email, game_name, game_slug, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ])
  if (leaguesRes.error) console.error('[platform] platform_leagues failed', leaguesRes.error)
  if (logRes.error) console.error('[platform] audit log read failed', logRes.error)

  const leagues = (leaguesRes.data ?? []) as PlatformLeague[]
  const log = (logRes.data ?? []) as AuditEntry[]
  const created = leagues.map((l) => l.created_at)
  const statuses = leagues.map((l) => leagueStatus(l))
  const statusCount = (status: (typeof statuses)[number]) => statuses.filter((s) => s === status).length
  const milestones = platformMilestones(leagues)

  return (
    <main className="px-4 pb-14 pt-9 sm:px-6">
      <div className="mx-auto w-full max-w-2xl">
        <p className="font-plex text-[9px] font-bold uppercase tracking-[.2em] text-[#bef264]">Developers only</p>
        <h1 className="mt-2 text-[26px] font-bold leading-none tracking-[-.035em] text-[#f4f9ff] sm:text-[30px]">Platform</h1>

        {leaguesRes.error && (
          <p className="mt-6 rounded-xl border border-[#e2686f]/40 bg-[#0a1421] px-4 py-3 font-inter-body text-[13px] text-[#e2686f]">
            Could not load the leagues. Check that the platform migration has been applied.
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <Total label="Leagues" value={leagues.length} week={countSince(created, 7)} month={countSince(created, 30)} />
          <Total
            label="Accounts"
            value={accountsRes.count ?? 0}
            week={accountsWeekRes.count ?? 0}
            month={accountsMonthRes.count ?? 0}
          />
        </div>
        <div className={cn(CARD, 'mt-2.5 grid grid-cols-3 divide-x divide-[#17263c]')}>
          <Cell label="Active">{statusCount('Active')}</Cell>
          <Cell label="Stalled">{statusCount('Stalled')}</Cell>
          <Cell label="Not started">{statusCount('Not started')}</Cell>
        </div>

        <Section title="Milestones">
          <div className={cn(CARD, 'divide-y divide-[#17263c]')}>
            {milestones.map((m) => (
              <div key={m.label} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-[150px] shrink-0 font-inter-body text-[13px] text-[#f4f9ff]">{m.label}</span>
                <progress
                  max={Math.max(leagues.length, 1)}
                  value={m.count}
                  aria-label={`${m.label}: ${m.count} of ${leagues.length} leagues`}
                  className="h-1.5 min-w-0 flex-1 appearance-none overflow-hidden rounded-full bg-[#17263c] [&::-moz-progress-bar]:bg-[#38bdf8] [&::-webkit-progress-bar]:bg-[#17263c] [&::-webkit-progress-value]:bg-[#38bdf8]"
                />
                <span className="w-6 text-right font-plex text-xs font-bold text-[#f4f9ff]">{m.count}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Leagues">
          {leagues.length === 0 ? (
            <p className={cn(CARD, 'px-4 py-3 font-inter-body text-[13px] text-[#8ba4c4]')}>No leagues yet.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {leagues.map((l, i) => (
                <Link key={l.id} href={`/platform/${l.id}`} className={cn(CARD, 'block transition-colors hover:border-[#38bdf8]')}>
                  <div className="flex items-center gap-3 p-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-base font-bold tracking-[-.02em] text-[#f4f9ff]">{l.name}</p>
                        <StatusTag status={statuses[i]} />
                      </div>
                      <p className="mt-1 truncate font-inter-body text-xs text-[#8ba4c4]">
                        /{l.slug} · {l.creator_name ?? l.creator_email ?? 'Creator removed'} · {formatDay(l.created_at)}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-[#6f88a8]" />
                  </div>
                  <div className="grid grid-cols-4 divide-x divide-[#17263c] border-t border-[#17263c] bg-[#0c1728]/60">
                    <Cell label="Members">{l.members}</Cell>
                    <Cell label="Players">{l.players}</Cell>
                    <Cell label="Results">{l.results}</Cell>
                    <Cell label="Last activity">{l.last_activity ? formatDay(l.last_activity).slice(0, -5) : NONE}</Cell>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section title="Audit log">
          <div className={cn(CARD, 'divide-y divide-[#17263c]')}>
            {log.length === 0 && <p className="px-4 py-2.5 font-inter-body text-[13px] text-[#8ba4c4]">Nothing yet.</p>}
            {log.map((entry) => (
              <p key={entry.id} className="px-4 py-2.5 font-inter-body text-[13px] text-[#8ba4c4]">
                {entry.actor_email ?? 'Someone'} deleted {entry.game_name} (/{entry.game_slug}) · {formatDay(entry.created_at)}
              </p>
            ))}
          </div>
        </Section>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint app/platform`
Expected: no errors.

- [ ] **Step 3: Check the gate signed out**

Run the dev server (`npm run dev`), then: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/platform`
Expected: `404`.

- [ ] **Step 4: Commit**

```bash
git add app/platform/page.tsx
git commit -m "Add the platform dashboard"
```

---

### Task 7: League page and delete dialog

**Files:**
- Modify: `lib/leagueApi.ts`
- Create: `components/platform/DeleteLeague.tsx`, `app/platform/[id]/page.tsx`
- Test: `components/__tests__/DeleteLeague.test.tsx`

- [ ] **Step 1: Add the browser call**

Append to `lib/leagueApi.ts`:

```ts
/** Platform admins only. `confirm` is the league's address, as typed. */
export function deletePlatformLeague(leagueId: string, confirm: string): Promise<void> {
  return send(`/api/platform/leagues/${leagueId}`, 'DELETE', { confirm })
}
```

- [ ] **Step 2: Write the failing component test**

```tsx
/**
 * @jest-environment jsdom
 */
// components/__tests__/DeleteLeague.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DeleteLeague } from '@/components/platform/DeleteLeague'
import { deletePlatformLeague } from '@/lib/leagueApi'

const push = jest.fn()
const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
jest.mock('@/lib/leagueApi', () => ({ deletePlatformLeague: jest.fn() }))

const SLUG = 'thursday-night-fives-k7x'

function open() {
  render(<DeleteLeague id="g1" name="Thursday Night Fives" slug={SLUG} members={3} players={14} results={9} />)
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  return {
    input: screen.getByRole('textbox'),
    confirm: screen.getByRole('button', { name: 'Delete league' }),
  }
}

beforeEach(() => jest.resetAllMocks())

it('keeps the delete button disabled until the full address is typed', () => {
  const { input, confirm } = open()
  expect(screen.getByText(/3 members, 14 players and 9 results/)).toBeInTheDocument()
  expect(confirm).toBeDisabled()
  fireEvent.change(input, { target: { value: 'thursday-night-fives' } })
  expect(confirm).toBeDisabled()
  fireEvent.change(input, { target: { value: SLUG } })
  expect(confirm).toBeEnabled()
})

it('deletes, then returns to the dashboard', async () => {
  ;(deletePlatformLeague as jest.Mock).mockResolvedValue(undefined)
  const { input, confirm } = open()
  fireEvent.change(input, { target: { value: SLUG } })
  fireEvent.click(confirm)
  await waitFor(() => expect(push).toHaveBeenCalledWith('/platform'))
  expect(deletePlatformLeague).toHaveBeenCalledWith('g1', SLUG)
  expect(refresh).toHaveBeenCalled()
})

it('shows the error and stays put when the delete fails', async () => {
  ;(deletePlatformLeague as jest.Mock).mockRejectedValue(new Error('Could not delete the league. Try again.'))
  const { input, confirm } = open()
  fireEvent.change(input, { target: { value: SLUG } })
  fireEvent.click(confirm)
  expect(await screen.findByText('Could not delete the league. Try again.')).toBeInTheDocument()
  expect(push).not.toHaveBeenCalled()
})
```

- [ ] **Step 3: Run to see it fail**

Run: `npm test -- components/__tests__/DeleteLeague.test.tsx`
Expected: FAIL, "Cannot find module '@/components/platform/DeleteLeague'".

- [ ] **Step 4: Write the component**

```tsx
// components/platform/DeleteLeague.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { deletePlatformLeague } from '@/lib/leagueApi'
import { pluralise } from '@/lib/utils'

interface Props {
  id: string
  name: string
  slug: string
  members: number
  players: number
  results: number
}

/** The danger zone card on a platform league page, and its type-to-confirm dialog. */
export function DeleteLeague({ id, name, slug, members, players, results }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      await deletePlatformLeague(id, typed)
      router.push('/platform')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the league. Try again.')
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-[#e2686f]/40 bg-[#0a1421] p-4">
        <div>
          <p className="text-[15px] font-bold tracking-[-.02em] text-[#f4f9ff]">Delete this league</p>
          <p className="mt-1 font-inter-body text-xs leading-[1.55] text-[#8ba4c4]">
            Removes the league and everything in it. A copy is kept in the audit log.
          </p>
        </div>
        <Button variant="destructive" size="sm" className="shrink-0 gap-2" onClick={() => setOpen(true)}>
          <Trash2 className="size-4" />
          Delete
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return
          setOpen(next)
          setTyped('')
          setError(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              This removes {pluralise(members, 'member')}, {pluralise(players, 'player')} and {pluralise(results, 'result')}. Members
              keep their accounts and nobody is emailed.
            </DialogDescription>
          </DialogHeader>
          <label className="block">
            <span className="font-inter-body text-xs text-[#8ba4c4]">
              Type <span className="font-plex font-bold text-[#f4f9ff]">{slug}</span> to confirm
            </span>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="mt-2"
            />
          </label>
          {error && <p role="alert" className="font-inter-body text-xs text-[#e2686f]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" disabled={busy || typed !== slug} onClick={handleDelete}>
              Delete league
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 5: Run to see it pass**

Run: `npm test -- components/__tests__/DeleteLeague.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 6: Write the league page**

```tsx
// app/platform/[id]/page.tsx
// One league as the platform admins see it. Gated in the page, like /platform.
export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { getUser } from '@/lib/fetchers'
import { createServiceClient } from '@/lib/supabase/service'
import { formatDay, isPlatformAdmin, leagueStatus } from '@/lib/platform'
import { formatKickoffTime } from '@/lib/dates'
import { Cell, Tag } from '@/components/LeagueList'
import { WinnerBadge } from '@/components/WinnerBadge'
import { DeleteLeague } from '@/components/platform/DeleteLeague'
import { CARD, LABEL, NONE, Section, StatusTag } from '@/components/platform/ui'
import { cn } from '@/lib/utils'
import type { GameRole, PlatformLeague, WeekStatus, Winner } from '@/lib/types'

export const metadata: Metadata = { title: 'Platform' }

interface MemberRow { user_id: string; role: GameRole; joined_at: string }
interface ProfileRow { id: string; email: string; first_name: string | null; last_name: string | null; display_name: string | null }
interface WeekRow { id: string; date: string; status: WeekStatus; winner: Winner }

const ROLE_LABEL: Record<GameRole, string> = { creator: 'Creator', admin: 'Admin', member: 'Member' }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className={LABEL}>{label}</dt>
      <dd className="min-w-0 truncate font-inter-body text-[13px] text-[#f4f9ff]">{children}</dd>
    </div>
  )
}

export default async function PlatformLeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user || !isPlatformAdmin(user.id)) notFound()
  const { id } = await params

  const service = createServiceClient()
  // An id that is not a uuid makes the two table reads fail; the league is then not found below.
  const [leaguesRes, membersRes, weeksRes] = await Promise.all([
    service.rpc('platform_leagues'),
    service.from('game_members').select('user_id, role, joined_at').eq('game_id', id).order('joined_at'),
    service
      .from('weeks')
      .select('id, date, status, winner')
      .eq('game_id', id)
      .order('season', { ascending: false })
      .order('week', { ascending: false })
      .limit(5),
  ])
  if (leaguesRes.error) console.error('[platform] platform_leagues failed', leaguesRes.error)
  const league = ((leaguesRes.data ?? []) as PlatformLeague[]).find((l) => l.id === id)
  if (!league) notFound()

  const members = (membersRes.data ?? []) as MemberRow[]
  const weeks = (weeksRes.data ?? []) as WeekRow[]
  const { data: profileRows } = await service
    .from('profiles')
    .select('id, email, first_name, last_name, display_name')
    .in('id', members.map((m) => m.user_id))
  const profiles = new Map(((profileRows ?? []) as ProfileRow[]).map((p) => [p.id, p]))
  const kickoff = formatKickoffTime(league.kickoff_time)

  return (
    <main className="px-4 pb-14 pt-9 sm:px-6">
      <div className="mx-auto w-full max-w-2xl">
        <Link
          href="/platform"
          className="inline-flex items-center gap-1.5 font-plex text-[10px] font-bold uppercase tracking-[.14em] text-[#8ba4c4] hover:text-[#f4f9ff]"
        >
          <ArrowLeft className="size-3.5" />
          Platform
        </Link>
        <div className="mt-4 flex items-center gap-2.5">
          <h1 className="min-w-0 truncate text-[26px] font-bold leading-none tracking-[-.035em] text-[#f4f9ff]">{league.name}</h1>
          <StatusTag status={leagueStatus(league)} />
        </div>
        <Link
          href={`/${league.slug}`}
          className="mt-2.5 inline-flex items-center gap-1.5 font-inter-body text-[13px] text-[#38bdf8] hover:text-[#7dd3fc]"
        >
          craft-football.com/{league.slug}
          <ExternalLink className="size-3.5" />
        </Link>

        <div className={cn(CARD, 'mt-6 grid grid-cols-4 divide-x divide-[#17263c]')}>
          <Cell label="Members">{league.members}</Cell>
          <Cell label="Players">{league.players}</Cell>
          <Cell label="Results">{league.results}</Cell>
          <Cell label="Last activity">{league.last_activity ? formatDay(league.last_activity).slice(0, -5) : NONE}</Cell>
        </div>

        <Section title="Details">
          <dl className={cn(CARD, 'divide-y divide-[#17263c]')}>
            <Row label="Created">{formatDay(league.created_at)}</Row>
            <Row label="Creator">
              {[league.creator_name, league.creator_email].filter(Boolean).join(' · ') || 'Creator removed'}
            </Row>
            <Row label="Match day">{[league.day, kickoff].filter(Boolean).join(' · ') || 'Not set'}</Row>
            <Row label="Venue">{league.location ?? 'Not set'}</Row>
          </dl>
        </Section>

        <Section title="Members">
          <div className={cn(CARD, 'divide-y divide-[#17263c]')}>
            {members.length === 0 && <p className="px-4 py-2.5 font-inter-body text-[13px] text-[#8ba4c4]">No members.</p>}
            {members.map((m) => {
              const p = profiles.get(m.user_id)
              const name = [p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.display_name || p?.email || 'Unknown'
              return (
                <div key={m.user_id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-inter-body text-[13px] font-semibold text-[#f4f9ff]">{name}</p>
                    <p className="mt-0.5 truncate font-inter-body text-xs text-[#8ba4c4]">
                      {p?.email ?? 'No profile'} · joined {formatDay(m.joined_at)}
                    </p>
                  </div>
                  <Tag tone={m.role === 'member' ? 'muted' : 'sky'}>{ROLE_LABEL[m.role]}</Tag>
                </div>
              )
            })}
          </div>
        </Section>

        <Section title="Recent weeks">
          {weeks.length === 0 ? (
            <p className={cn(CARD, 'px-4 py-3 font-inter-body text-[13px] text-[#8ba4c4]')}>No weeks yet.</p>
          ) : (
            <div className={cn(CARD, 'divide-y divide-[#17263c]')}>
              {weeks.map((w) => (
                <div key={w.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="font-plex text-xs font-bold text-[#f4f9ff]">{w.date}</span>
                  {w.status === 'unrecorded' || w.status === 'scheduled' ? (
                    <Tag>{w.status === 'scheduled' ? 'Scheduled' : 'Awaiting result'}</Tag>
                  ) : (
                    <WinnerBadge winner={w.winner} cancelled={w.status === 'cancelled'} dnf={w.status === 'dnf'} />
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Danger zone">
          <DeleteLeague
            id={league.id}
            name={league.name}
            slug={league.slug}
            members={league.members}
            players={league.players}
            results={league.results}
          />
        </Section>
      </div>
    </main>
  )
}
```

- [ ] **Step 7: Type-check, lint, and check the gate**

Run: `npx tsc --noEmit && npx eslint app/platform components/platform`
Expected: no errors.

With the dev server running: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/platform/11111111-1111-1111-1111-111111111111`
Expected: `404`.

- [ ] **Step 8: Commit**

```bash
git add lib/leagueApi.ts components/platform/DeleteLeague.tsx components/__tests__/DeleteLeague.test.tsx "app/platform/[id]/page.tsx"
git commit -m "Add the platform league page and delete dialog"
```

---

### Task 8: Documentation, clean-up and release

**Files:**
- Modify: `CLAUDE.md`, `.env.example`
- Delete: `app/new/mock-platform/`

- [ ] **Step 1: Remove the design mock**

```bash
rm -r app/new/mock-platform
```

A copy is in `.context/mock-platform-page.tsx`.

- [ ] **Step 2: Document the variable**

Append to `.env.example`:

```
# Who may open the platform admin portal at /platform: comma-separated
# Supabase user ids. Leave unset and nobody can.
PLATFORM_ADMIN_IDS=
```

In `CLAUDE.md`:

Repository structure, after the `│   ├── invite/` line:

```
│   ├── platform/             # Platform admin portal: every league, usage, delete (PLATFORM_ADMIN_IDS only)
```

Auth and access model, a new bullet after the "Both require a Supabase session" bullet:

```
- `/platform` and `/api/platform/*` are for platform admins: the user ids in `PLATFORM_ADMIN_IDS`, checked by `isPlatformAdmin()` in `lib/platform.ts`. Each page and route checks it itself and answers 404 to everyone else. They read and delete across leagues with the service-role client; never add an RLS policy for this, and never store the role in the database
```

Environment variables table, a new row after `SHARE_SIGNING_SECRET`:

```
| `PLATFORM_ADMIN_IDS` | Server only | Comma-separated Supabase user ids allowed into the platform admin portal at `/platform`. Missing → the portal is a 404 for everyone. |
```

- [ ] **Step 3: Run every check**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass. Then `npm run bundle-report`: the shared baseline stays under 80 kB.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md .env.example
git commit -m "Document the platform admin portal"
```

- [ ] **Step 5: Release (needs Will)**

In this order. Each step fails closed if the next has not happened.

1. Collect the three user ids while the `role` column still marks them. Read-only, against production (see the `supabase-logs-access` memory for how):

   ```sql
   select id, email from public.profiles where role = 'developer' order by created_at;
   ```

   Expected: three rows. Join the ids with commas; that is the value for `PLATFORM_ADMIN_IDS`. Keep it out of the repository.
2. Will runs `supabase/migrations/20261117000002_platform_admin.sql` in the Supabase SQL editor.
3. Confirm it with a read-only query against production:

   ```sql
   select
     has_function_privilege('authenticated', 'public.platform_leagues()', 'EXECUTE')                 as auth_list,
     has_function_privilege('anon',          'public.platform_leagues()', 'EXECUTE')                 as anon_list,
     has_function_privilege('authenticated', 'public.platform_delete_league(uuid, uuid)', 'EXECUTE') as auth_delete,
     has_function_privilege('anon',          'public.platform_delete_league(uuid, uuid)', 'EXECUTE') as anon_delete,
     has_table_privilege('authenticated',    'public.platform_audit_log', 'SELECT')                  as auth_log,
     has_function_privilege('service_role',  'public.platform_leagues()', 'EXECUTE')                 as service_list,
     exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'role')   as role_column;
   ```

   Expected: `false, false, false, false, false, true, false`.
4. Will sets `PLATFORM_ADMIN_IDS` in Vercel (Production) and in `.env.local`.
5. Merge and deploy.
6. Will signs in on production: the Radar button shows in the header, `/platform` lists both leagues, and a signed-out window gets a 404 at `/platform`. Do not test delete on `craft-football`; create a throwaway league through `/new` and delete that.
