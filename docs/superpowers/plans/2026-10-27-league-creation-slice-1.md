# League creation, slice 1: create path — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user can create a league from `/new` (name, venue, match day and kick-off) and land on a Live screen that shares the public league link.

**Architecture:** One client wizard holds the three pre-creation answers and moves between step URLs with `pushState`. `POST /api/games` resolves the slug and calls a rewritten `create_game` RPC that also makes the creator a player. `/new/[slug]/live` is a server page. The slug is fixed at creation and the details PATCH stops regenerating it.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 utility classes, Supabase (plpgsql SECURITY DEFINER RPC), Jest with ts-jest.

**Spec:** `docs/superpowers/specs/2026-10-27-league-creation-slice-1-design.md`. Visual values come from `docs/superpowers/specs/2026-10-27-league-creation-handoff.md` ("Shared page shell" and screens 2, 3, 4, 9).

**Before deploying:** the migration in Task 1 must be run by hand in the Supabase SQL editor (production migrations are not applied automatically).

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/20261027000001_create_league.sql` | New `create_game` signature, creator roster row and claim, `claim_profile` copies names |
| `lib/dates.ts` | `parseKickoffInput` (typed kick-off → `'HH:MM'`) |
| `lib/__tests__/dates.parseKickoffInput.test.ts` | Its tests |
| `lib/fetchers.ts` | `ensureUnrecordedWeek` ignores a league with no weeks |
| `lib/__tests__/fetchers.test.ts` | One new case |
| `app/api/league/[id]/details/route.ts` | PATCH no longer re-slugs |
| `components/LeagueDetailsForm.tsx` | URL preview shows the fixed slug |
| `app/api/games/route.ts` | `POST` creates a league |
| `app/api/games/slug/route.ts` | `GET ?name=` previews the resolved slug |
| `lib/slug.ts` | Never hands out a slug that is also a top-level route |
| `__tests__/api-games.test.ts` | Route tests |
| `proxy.ts` | `/new` requires a session and profile |
| `components/ui/navbar.tsx` | Hidden on `/new`; "Create a league" menu item |
| `components/new-league/StepShell.tsx` | Shared frame and shared class strings |
| `components/new-league/NewLeagueWizard.tsx` | State, step routing, submit |
| `components/new-league/NameStep.tsx`, `WhereStep.tsx`, `WhenStep.tsx` | One screen each |
| `app/new/[[...step]]/page.tsx` | Renders the wizard, or the Live screen for `/new/[slug]/live` |
| `components/new-league/LiveScreen.tsx` | Live screen (server component) |
| `components/new-league/LiveShareCard.tsx` | Share and copy (client) |
| `app/page.tsx` | Entry points on Your leagues |

---

### Task 1: Migration — `create_game` and `claim_profile`

**Files:**
- Create: `supabase/migrations/20261027000001_create_league.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20261027000001_create_league.sql
--
-- League creation from /new. The old create_game(text) failed because
-- games.slug is NOT NULL and nothing called it. The new one takes every
-- field the wizard collects, adds the creator as a member and, because the
-- creator is always a player, as a roster row with an approved claim.
-- Nothing seeds league_features: no feature is flagged (DEFAULT_FEATURES is
-- empty).

DROP FUNCTION IF EXISTS public.create_game(text);

CREATE OR REPLACE FUNCTION public.create_game(
  p_name text,
  p_slug text,
  p_location text,
  p_day text,
  p_kickoff_time text,
  p_bio text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game_id uuid;
  v_player text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF trim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;
  IF trim(coalesce(p_slug, '')) = '' THEN
    RAISE EXCEPTION 'invalid_slug';
  END IF;

  -- The player name the roster and claim use: "First Last" from the profile,
  -- falling back to the display name, then the email's local part.
  SELECT coalesce(
           nullif(trim(concat_ws(' ', first_name, last_name)), ''),
           nullif(trim(display_name), ''),
           split_part(email, '@', 1)
         )
    INTO v_player
    FROM profiles
   WHERE id = auth.uid();
  IF v_player IS NULL THEN
    RAISE EXCEPTION 'profile_missing';
  END IF;

  INSERT INTO games (name, slug, location, day, kickoff_time, bio, created_by)
  VALUES (
    trim(p_name),
    trim(p_slug),
    nullif(trim(coalesce(p_location, '')), ''),
    p_day,
    p_kickoff_time,
    nullif(trim(coalesce(p_bio, '')), ''),
    auth.uid()
  )
  RETURNING id INTO v_game_id;

  INSERT INTO game_members (game_id, user_id, role)
  VALUES (v_game_id, auth.uid(), 'creator');

  INSERT INTO player_attributes (game_id, name, rating, mentality, goalkeeper)
  VALUES (v_game_id, v_player, 2, 'balanced', false);

  INSERT INTO player_claims (game_id, user_id, player_name, status, reviewed_by)
  VALUES (v_game_id, auth.uid(), v_player, 'approved', auth.uid());

  RETURN v_game_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_game(text, text, text, text, text, text) TO authenticated;

-- claim_profile only wrote display_name, so the roster pre-fill had nothing
-- to read for users who signed up through the OTP form (which sends
-- first_name and last_name in the metadata). Copy them on insert.
CREATE OR REPLACE FUNCTION public.claim_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb;
  disp_name text;
BEGIN
  meta := auth.jwt()->'user_metadata';
  disp_name := COALESCE(
    meta->>'display_name',
    meta->>'name',
    auth.jwt()->>'name',
    split_part(auth.email(), '@', 1)
  );

  INSERT INTO profiles (id, email, display_name, first_name, last_name)
  SELECT auth.uid(), auth.email(), disp_name,
         nullif(trim(meta->>'first_name'), ''),
         nullif(trim(meta->>'last_name'), '')
  WHERE auth.uid() IS NOT NULL
    AND auth.email() IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid())
  ON CONFLICT (id) DO NOTHING;
END;
$$;
```

- [ ] **Step 2: Sanity-check the SQL parses**

There is no local database. Read the file once more against the schemas: `games(name, slug, location, day, kickoff_time, bio, created_by)`, `game_members(game_id, user_id, role)`, `player_attributes(game_id, name, goalkeeper, mentality, rating)`, `player_claims(game_id, user_id, player_name, status, reviewed_by)`, `profiles(id, email, display_name, first_name, last_name)`. All five match the migrations in `supabase/migrations/`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261027000001_create_league.sql
git commit -m "Rewrite create_game for the league setup flow and copy names in claim_profile

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `parseKickoffInput`

**Files:**
- Modify: `lib/dates.ts` (after `parseKickoffTime`, around line 165)
- Create: `lib/__tests__/dates.parseKickoffInput.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/dates.parseKickoffInput.test.ts
import { parseKickoffInput } from '@/lib/dates'

describe('parseKickoffInput', () => {
  it.each([
    ['8', '20:00'],
    ['8:15', '20:15'],
    ['8.30', '20:30'],
    ['20:15', '20:15'],
    ['8pm', '20:00'],
    ['8.30pm', '20:30'],
    ['8:30 pm', '20:30'],
    ['7am', '07:00'],
    ['12', '12:00'],
    ['5', '17:00'],
    ['6', '06:00'],
    ['18:50', '18:45'],
    ['18:53', '19:00'],
    ['23:55', '00:00'],
    [' 9 ', '21:00'],
  ])('reads %p as %p', (input, expected) => {
    expect(parseKickoffInput(input)).toBe(expected)
  })

  it.each(['', 'abc', '25', '8:70', '13pm', '0am', '8:1x'])('rejects %p', (input) => {
    expect(parseKickoffInput(input)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- lib/__tests__/dates.parseKickoffInput.test.ts`
Expected: FAIL, `parseKickoffInput` is not exported from `@/lib/dates`.

- [ ] **Step 3: Implement**

Add to `lib/dates.ts` directly after `parseKickoffTime`:

```ts
/**
 * A kick-off typed into the league setup stepper: '8', '8:15', '8.30',
 * '20:15', '8pm', '8.30pm', '8:30 pm'. A bare hour under 6 with no am/pm is
 * an evening game. Minutes round to the nearest quarter hour. Returns
 * 'HH:MM' (what games.kickoff_time stores) or null for anything unreadable.
 */
export function parseKickoffInput(text: string): string | null {
  const m = text.trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{1,2}))?\s*(am|pm)?$/)
  if (!m) return null
  let hours = Number(m[1])
  const minutes = Number(m[2] ?? 0)
  if (minutes > 59) return null
  if (m[3]) {
    if (hours < 1 || hours > 12) return null
    hours = (hours % 12) + (m[3] === 'pm' ? 12 : 0)
  } else {
    if (hours > 23) return null
    if (hours < 6) hours += 12
  }
  let rounded = Math.round(minutes / 15) * 15
  if (rounded === 60) {
    rounded = 0
    hours = (hours + 1) % 24
  }
  return `${String(hours).padStart(2, '0')}:${String(rounded).padStart(2, '0')}`
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- lib/__tests__/dates.parseKickoffInput.test.ts`
Expected: PASS, 22 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/dates.ts lib/__tests__/dates.parseKickoffInput.test.ts
git commit -m "Add parseKickoffInput for typed kick-off times

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `ensureUnrecordedWeek` ignores a league with no weeks

**Files:**
- Modify: `lib/fetchers.ts:408-415`
- Test: `lib/__tests__/fetchers.test.ts` (inside `describe('ensureUnrecordedWeek')`, after the "does nothing before the game day deadline" case)

- [ ] **Step 1: Write the failing test**

```ts
  it('does nothing for a league with no weeks yet', async () => {
    // A league created on Friday 10 Apr with Thursday as its day must not
    // start life with an unrecorded week for Thursday 9 Apr.
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 10, 12))
    const rpc = jest.fn()
    ;(createServiceClient as jest.Mock).mockReturnValue({ rpc })
    const weeks: Week[] = []

    await expect(ensureUnrecordedWeek(LEAGUE, weeks, 4)).resolves.toBe(weeks)
    expect(rpc).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- lib/__tests__/fetchers.test.ts -t "no weeks yet"`
Expected: FAIL, `rpc` was called with `create_unrecorded_week`.

- [ ] **Step 3: Implement**

In `ensureUnrecordedWeek`, before `const recentDate = …`:

```ts
  // A brand-new league has nothing to be unrecorded against; without this the
  // admin's first visit would stamp last week's match day as a missed game.
  if (weeks.length === 0) return weeks
```

- [ ] **Step 4: Run the whole fetchers suite**

Run: `npm test -- lib/__tests__/fetchers.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add lib/fetchers.ts lib/__tests__/fetchers.test.ts
git commit -m "Do not create an unrecorded week for a league with no weeks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Slug is fixed at creation

**Files:**
- Modify: `app/api/league/[id]/details/route.ts:1-5, 29, 55-72`
- Modify: `components/LeagueDetailsForm.tsx:6, 103-104, 237`

- [ ] **Step 1: Stop re-slugging in the PATCH route**

Remove the import `import { resolveUniqueSlug } from '@/lib/slug'`. Change the PATCH doc comment to:

```ts
/** PATCH — admin-only, updates the details. The slug is fixed at creation, so it never changes here. Returns { ok, slug }. */
```

Replace everything from `const service = createServiceClient()` to the end of the handler with:

```ts
  const service = createServiceClient()
  // The slug never changes on rename; it is returned so the form's redirect
  // logic keeps working unchanged.
  const { data: current } = await service.from('games').select('slug').eq('id', id).maybeSingle()
  const slug = (current?.slug as string | null | undefined) ?? null

  const { error } = await service
    .from('games')
    .update({ name, location, day, kickoff_time, bio })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidateLeague(id, slug ? [slug] : [])
  return NextResponse.json({ ok: true, slug })
}
```

- [ ] **Step 2: Fix the Settings form's URL preview and comment**

In `components/LeagueDetailsForm.tsx` line 237 replace

```tsx
                URL: <span className="text-[#8ba4c4]">craft-football.com/{generateSlug(name.trim())}</span>
```

with

```tsx
                URL: <span className="text-[#8ba4c4]">craft-football.com/{leagueSlug}</span>
```

Remove `generateSlug` from the import on line 6. Replace the comment on lines 103 to 104 with:

```ts
      // The slug is fixed at creation, so this is normally a refresh; the
      // redirect branch only runs if an older response ever returns a new slug.
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If `leagueSlug` is not in scope at line 237, it is the prop already used on line 85 and 106; it is.)

- [ ] **Step 4: Commit**

```bash
git add app/api/league/\[id\]/details/route.ts components/LeagueDetailsForm.tsx
git commit -m "Keep a league's slug fixed when it is renamed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `POST /api/games` and `GET /api/games/slug`

**Files:**
- Create: `app/api/games/route.ts`
- Create: `app/api/games/slug/route.ts`
- Create: `__tests__/api-games.test.ts`

- [ ] **Step 1: Write the failing route test**

```ts
// __tests__/api-games.test.ts
import { createClient } from '@/lib/supabase/server'
import { mockAuthNamespace } from '@/lib/__tests__/helpers/supabase-auth'
import { resolveUniqueSlug } from '@/lib/slug'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/slug', () => ({ resolveUniqueSlug: jest.fn() }))

import { POST } from '@/app/api/games/route'

const USER = { id: 'u1', email: 'a@example.com' }
const VALID = { name: 'Hackney Thursdays', day: 'Thursday', kickoff_time: '20:00', location: ' Mabley Green ', bio: '' }
const rpc = jest.fn()

function setup(user: typeof USER | null) {
  ;(createClient as jest.Mock).mockResolvedValue({ auth: mockAuthNamespace(user), rpc })
}

function post(body: unknown) {
  return POST(new Request('http://localhost/api/games', { method: 'POST', body: JSON.stringify(body) }))
}

beforeEach(() => {
  jest.resetAllMocks()
  ;(resolveUniqueSlug as jest.Mock).mockResolvedValue('hackney-thursdays')
})

describe('POST /api/games', () => {
  it('returns 401 when signed out and never calls the RPC', async () => {
    setup(null)
    const res = await post(VALID)
    expect(res.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['a blank name', { ...VALID, name: '  ' }],
    ['a name over 80 characters', { ...VALID, name: 'x'.repeat(81) }],
    ['an unknown day', { ...VALID, day: 'Thu' }],
    ['a 12-hour time', { ...VALID, kickoff_time: '8pm' }],
    ['a missing time', { ...VALID, kickoff_time: undefined }],
  ])('returns 400 for %s', async (_label, body) => {
    setup(USER)
    const res = await post(body)
    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('creates the league with the resolved slug and returns id and slug', async () => {
    setup(USER)
    rpc.mockResolvedValue({ data: 'game-1', error: null })
    const res = await post(VALID)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ id: 'game-1', slug: 'hackney-thursdays' })
    expect(resolveUniqueSlug).toHaveBeenCalledWith('Hackney Thursdays')
    expect(rpc).toHaveBeenCalledWith('create_game', {
      p_name: 'Hackney Thursdays',
      p_slug: 'hackney-thursdays',
      p_location: 'Mabley Green',
      p_day: 'Thursday',
      p_kickoff_time: '20:00',
      p_bio: null,
    })
  })

  it('returns 409 slug_taken on a unique violation', async () => {
    setup(USER)
    rpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "games_slug_unique"' } })
    const res = await post(VALID)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'slug_taken' })
  })

  it('maps other RPC errors through rpcErrorStatus', async () => {
    setup(USER)
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'profile_missing' } })
    const res = await post(VALID)
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- __tests__/api-games.test.ts`
Expected: FAIL, cannot find module `@/app/api/games/route`.

- [ ] **Step 3: Write the POST route**

```ts
// app/api/games/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser, rpcErrorStatus } from '@/lib/apiAuth'
import { resolveUniqueSlug } from '@/lib/slug'

const VALID_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/
const PG_UNIQUE_VIOLATION = '23505'

/**
 * POST — any signed-in user. Creates a league through create_game, which also
 * makes the caller its creator and first player. Returns { id, slug }.
 * 409 slug_taken means another league took the slug between the wizard's
 * preview and this request; the client retries once.
 */
export async function POST(req: Request) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const name = typeof b?.name === 'string' ? b.name.trim() : ''
  if (!name || name.length > 80) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const day = typeof b?.day === 'string' && VALID_DAYS.includes(b.day) ? b.day : null
  if (!day) return NextResponse.json({ error: 'Pick a match day' }, { status: 400 })
  const kickoff_time = typeof b?.kickoff_time === 'string' && HH_MM.test(b.kickoff_time) ? b.kickoff_time : null
  if (!kickoff_time) return NextResponse.json({ error: 'Pick a kick-off time' }, { status: 400 })
  const location = typeof b?.location === 'string' ? b.location.trim() || null : null
  const bio = typeof b?.bio === 'string' ? b.bio.trim() || null : null

  const slug = await resolveUniqueSlug(name)
  const supabase = await createClient()
  const { data: id, error } = await supabase.rpc('create_game', {
    p_name: name,
    p_slug: slug,
    p_location: location,
    p_day: day,
    p_kickoff_time: kickoff_time,
    p_bio: bio,
  })
  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: rpcErrorStatus(error.message) })
  }
  return NextResponse.json({ id, slug })
}
```

- [ ] **Step 4: Write the slug preview route**

```ts
// app/api/games/slug/route.ts
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
import { resolveUniqueSlug } from '@/lib/slug'
import { generateSlug } from '@/lib/utils'

/** GET ?name= — signed-in only. The address a new league with this name would get (with -2, -3 when taken). */
export async function GET(req: Request) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const name = new URL(req.url).searchParams.get('name') ?? ''
  if (!generateSlug(name)) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  return NextResponse.json({ slug: await resolveUniqueSlug(name) })
}
```

- [ ] **Step 5: Reserve the top-level route names**

Anyone can now create a league, so a league called "New" or "Settings" would
be unreachable behind `app/new` or `app/settings`. In `lib/slug.ts`, above
`resolveUniqueSlug`, add:

```ts
/** Top-level routes in app/; a league slug must never shadow one. */
const RESERVED = new Set(['api', 'app', 'auth', 'invite', 'new', 'profile-required', 'results', 'settings', 'sign-in'])
```

and in the loop, replace

```ts
    const { data, error } = await query.maybeSingle()
    if (error) throw error
    if (!data) return candidate
```

with

```ts
    if (!RESERVED.has(candidate)) {
      const { data, error } = await query.maybeSingle()
      if (error) throw error
      if (!data) return candidate
    }
```

- [ ] **Step 6: Run the tests**

Run: `npm test -- __tests__/api-games.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 7: Commit**

```bash
git add app/api/games __tests__/api-games.test.ts lib/slug.ts
git commit -m "Add POST /api/games and a slug preview route

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Guard `/new` and hide the navbar there

**Files:**
- Modify: `proxy.ts:33-35, 52-54`
- Modify: `components/ui/navbar.tsx:165-167`

- [ ] **Step 1: Proxy**

Replace lines 52 to 54 with:

```ts
  const isAccountSettings = pathname === '/settings' || pathname.startsWith('/settings/')
  const isLeagueSettings = /^\/[^/]+\/settings(\/|$)/.test(pathname)
  const isNewLeague = pathname === '/new' || pathname.startsWith('/new/')
  const needsSession = isAccountSettings || isLeagueSettings || isNewLeague
```

In the doc comment above `proxy`, change "Two routes also need a session with a profiles row before they render: the account page, and a league's settings page, whose server component checks the admin role itself and redirects members." to "Three routes also need a session with a profiles row before they render: the account page, the league setup flow at /new, and a league's settings page, whose server component checks the admin role itself and redirects members."

- [ ] **Step 2: Navbar**

In `components/ui/navbar.tsx`, directly after

```tsx
  if (pathname === '/' && (pending || !user)) return null
```

add

```tsx
  // The league setup flow at /new draws its own centred shell with no header.
  if (pathname === '/new' || pathname.startsWith('/new/')) return null
```

- [ ] **Step 3: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add proxy.ts components/ui/navbar.tsx
git commit -m "Require a session on /new and hide the navbar there

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `StepShell`

**Files:**
- Create: `components/new-league/StepShell.tsx`

- [ ] **Step 1: Write the component and shared classes**

```tsx
// components/new-league/StepShell.tsx
// The frame every league-setup screen shares (handoff: "Shared page shell").
// The root layout already paints the dot grid behind the top of the page.
import type { ReactNode } from 'react'

interface StepShellProps {
  /** Centred line between the logo and the title: the step eyebrow or the Live pill. */
  eyebrow?: ReactNode
  title: ReactNode
  sub: ReactNode
  children: ReactNode
  /** The primary action, full width. */
  action?: ReactNode
  /** Centred text link under the action. */
  secondary?: ReactNode
}

export function StepShell({ eyebrow, title, sub, children, action, secondary }: StepShellProps) {
  return (
    <main className="mx-auto w-full max-w-[520px] px-4 py-9 sm:px-6 sm:py-[72px]">
      <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-[#223a5c] bg-[linear-gradient(160deg,#0e2a44_0%,#0a1628_55%,#081020_100%)] shadow-[0_14px_36px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,255,255,.08)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- same static asset as the landing header */}
        <img src="/logo.png" alt="" className="size-9 brightness-150 drop-shadow-[0_4px_10px_rgba(0,0,0,.5)]" />
      </div>
      {eyebrow && <div className="mt-7 flex justify-center">{eyebrow}</div>}
      <h1 className="mt-7 text-center text-2xl font-bold leading-[1.15] tracking-[-.03em] text-[#f4f9ff] [text-wrap:pretty] sm:text-[28px]">
        {title}
      </h1>
      <p className="mt-2.5 text-center font-inter-body text-[14.5px] leading-[1.5] text-[#8ba4c4]">{sub}</p>
      <div className="mt-8">{children}</div>
      {action && <div className="mt-7">{action}</div>}
      {secondary && <div className="mt-[18px] text-center">{secondary}</div>}
    </main>
  )
}

/** Steps shown in the eyebrow. Grows as later slices add roster and results steps. */
export const STEP_COUNT = 3

/** `STEP 2/3` in lime. */
export function StepEyebrow({ n, of }: { n: number; of: number }) {
  return (
    <p className="inline-flex items-center gap-2 font-plex text-[9.5px] font-bold uppercase tracking-[.18em] text-[#bef264]">
      <span className="h-0.5 w-[18px] bg-[#bef264]" />
      Step {n}/{of}
    </p>
  )
}

// Shared class strings: the handoff's primary button, outline button, text
// link and input. Compose with cn() where a screen needs a variation.
export const PRIMARY_BUTTON =
  'flex h-[50px] w-full items-center justify-center rounded-lg bg-[#38bdf8] text-[15px] font-bold text-[#05101d] transition-colors hover:bg-[#7dd3fc] disabled:opacity-40 disabled:hover:bg-[#38bdf8]'
export const OUTLINE_BUTTON =
  'flex h-[50px] w-full items-center justify-center rounded-lg border border-[#223a5c] text-[15px] font-bold text-[#cfe0f4] transition-colors hover:border-[#38bdf8]'
export const SECONDARY_LINK =
  'font-inter-body text-[13.5px] font-semibold text-[#8ba4c4] transition-colors hover:text-[#f4f9ff]'
export const FIELD =
  'h-[50px] w-full rounded-lg border border-[#1b2c46] bg-[#0a1421] px-4 font-inter-body text-[15px] text-[#f4f9ff] placeholder:text-[#4f688a] focus:border-[#38bdf8] focus:outline-none'
```

- [ ] **Step 2: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add components/new-league/StepShell.tsx
git commit -m "Add the shared StepShell frame for league setup screens

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The wizard and its three steps

**Files:**
- Create: `components/new-league/NewLeagueWizard.tsx`
- Create: `components/new-league/NameStep.tsx`
- Create: `components/new-league/WhereStep.tsx`
- Create: `components/new-league/WhenStep.tsx`
- Create: `app/new/[[...step]]/page.tsx`

- [ ] **Step 1: Wizard**

```tsx
// components/new-league/NewLeagueWizard.tsx
'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { NameStep } from './NameStep'
import { WhereStep } from './WhereStep'
import { WhenStep } from './WhenStep'

const STEPS = ['name', 'where', 'when'] as const
type Step = (typeof STEPS)[number]

export interface LeagueDraft {
  name: string
  bio: string
  location: string
  /** Full day name, as games.day stores it. */
  day: string
  /** 'HH:MM', as games.kickoff_time stores it. */
  time: string
}

const EMPTY: LeagueDraft = { name: '', bio: '', location: '', day: 'Thursday', time: '20:00' }

function stepFromPath(pathname: string): Step {
  const last = pathname.split('/').pop() ?? ''
  return (STEPS as readonly string[]).includes(last) ? (last as Step) : 'name'
}

function postLeague(d: LeagueDraft) {
  return fetch('/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: d.name, bio: d.bio, location: d.location, day: d.day, kickoff_time: d.time }),
  })
}

/**
 * Name, Where and When, before the league exists. The answers live here;
 * each step gets its own URL through pushState, which Next syncs to
 * usePathname, so the browser's back button steps backwards. A refresh
 * starts again at Name.
 */
export function NewLeagueWizard() {
  const pathname = usePathname()
  const router = useRouter()
  const [draft, setDraft] = useState<LeagueDraft>(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const step = stepFromPath(pathname)

  // A hard load of a later step has nothing to continue from.
  useEffect(() => {
    if (step !== 'name' && !draft.name) window.history.replaceState(null, '', '/new/name')
  }, [step, draft.name])

  const go = (next: Step) => window.history.pushState(null, '', `/new/${next}`)
  const update = (patch: Partial<LeagueDraft>) => setDraft((d) => ({ ...d, ...patch }))

  async function create() {
    setSubmitting(true)
    setError(null)
    try {
      let res = await postLeague(draft)
      // The server re-resolves the slug, so one retry clears a race on the name.
      if (res.status === 409) res = await postLeague(draft)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === 'string' && data.error !== 'slug_taken' ? data.error : 'Could not create the league. Try again.')
        return
      }
      router.push(`/new/${data.slug}/live`)
    } catch {
      setError('Could not create the league. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'where') return <WhereStep draft={draft} onChange={update} onNext={() => go('when')} />
  if (step === 'when') return <WhenStep draft={draft} onChange={update} onSubmit={create} submitting={submitting} error={error} />
  return <NameStep draft={draft} onChange={update} onNext={() => go('where')} />
}
```

- [ ] **Step 2: Name step**

```tsx
// components/new-league/NameStep.tsx
'use client'

import { useEffect, useState } from 'react'
import { cn, generateSlug } from '@/lib/utils'
import { FIELD, PRIMARY_BUTTON, SECONDARY_LINK, STEP_COUNT, StepEyebrow, StepShell } from './StepShell'
import type { LeagueDraft } from './NewLeagueWizard'

interface Props {
  draft: LeagueDraft
  onChange: (patch: Partial<LeagueDraft>) => void
  onNext: () => void
}

export function NameStep({ draft, onChange, onNext }: Props) {
  const [showBio, setShowBio] = useState(draft.bio !== '')
  const [slug, setSlug] = useState(generateSlug(draft.name))
  const canContinue = draft.name.trim().length > 0

  // The server's resolved address (adds -2 when the name is taken); the local
  // slug stands in while it loads or if the request fails.
  useEffect(() => {
    const local = generateSlug(draft.name)
    setSlug(local)
    if (!local) return
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/games/slug?name=${encodeURIComponent(draft.name)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (typeof d?.slug === 'string') setSlug(d.slug) })
        .catch(() => {})
    }, 300)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [draft.name])

  return (
    <StepShell
      eyebrow={<StepEyebrow n={1} of={STEP_COUNT} />}
      title="What is your league called?"
      sub="This becomes your link too. It is set now and stays put if you rename the league later."
      action={<button type="button" className={PRIMARY_BUTTON} disabled={!canContinue} onClick={onNext}>Continue</button>}
      secondary={!showBio && <button type="button" className={SECONDARY_LINK} onClick={() => setShowBio(true)}>Add a short bio</button>}
    >
      <input
        aria-label="League name"
        className={cn(FIELD, 'h-[54px] text-[17px] font-semibold')}
        placeholder="e.g. Hackney Thursdays"
        maxLength={80}
        value={draft.name}
        onChange={(e) => onChange({ name: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Enter' && canContinue) onNext() }}
        autoFocus
      />
      <p className="mt-3 text-center font-plex text-[11px] tracking-[.04em] text-[#4f688a]">
        craft-football.com/<span className="text-[#8ba4c4]">{slug}</span>
      </p>
      {showBio && (
        <textarea
          aria-label="Short bio"
          className={cn(FIELD, 'mt-5 h-auto py-3 text-sm')}
          rows={2}
          placeholder="A line or two about the game. Optional."
          value={draft.bio}
          onChange={(e) => onChange({ bio: e.target.value })}
        />
      )}
    </StepShell>
  )
}
```

- [ ] **Step 3: Where step**

```tsx
// components/new-league/WhereStep.tsx
'use client'

import { FIELD, PRIMARY_BUTTON, STEP_COUNT, StepEyebrow, StepShell } from './StepShell'
import type { LeagueDraft } from './NewLeagueWizard'

interface Props {
  draft: LeagueDraft
  onChange: (patch: Partial<LeagueDraft>) => void
  onNext: () => void
}

// shortcut: free text only, Places autocomplete and the map preview arrive in slice 5
export function WhereStep({ draft, onChange, onNext }: Props) {
  const canContinue = draft.location.trim().length > 0
  return (
    <StepShell
      eyebrow={<StepEyebrow n={2} of={STEP_COUNT} />}
      title="Where do you play?"
      sub="Name the pitch or venue. We save it so it reads well on your league page."
      action={<button type="button" className={PRIMARY_BUTTON} disabled={!canContinue} onClick={onNext}>Continue</button>}
    >
      <input
        aria-label="Venue"
        className={FIELD}
        placeholder="e.g. Mabley Green"
        maxLength={120}
        value={draft.location}
        onChange={(e) => onChange({ location: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Enter' && canContinue) onNext() }}
        autoFocus
      />
    </StepShell>
  )
}
```

- [ ] **Step 4: When step**

```tsx
// components/new-league/WhenStep.tsx
'use client'

import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseKickoffInput } from '@/lib/dates'
import { PRIMARY_BUTTON, STEP_COUNT, StepEyebrow, StepShell } from './StepShell'
import type { LeagueDraft } from './NewLeagueWizard'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

interface Props {
  draft: LeagueDraft
  onChange: (patch: Partial<LeagueDraft>) => void
  onSubmit: () => void
  submitting: boolean
  error: string | null
}

/** '20:15' → ['8:15', 'pm'] for the stepper. */
function to12h(time: string): [string, string] {
  const [h, m] = time.split(':').map(Number)
  return [`${h % 12 || 12}:${String(m).padStart(2, '0')}`, h < 12 ? 'am' : 'pm']
}

/** Moves 'HH:MM' by `minutes`, wrapping at midnight. */
function stepTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = (h * 60 + m + minutes + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function WhenStep({ draft, onChange, onSubmit, submitting, error }: Props) {
  const [display, suffix] = to12h(draft.time)
  // The text while the kick-off input is being edited; null when it shows the saved time.
  const [typed, setTyped] = useState<string | null>(null)
  const invalid = typed !== null && typed !== '' && parseKickoffInput(typed) === null

  function step(minutes: number) {
    setTyped(null)
    onChange({ time: stepTime(draft.time, minutes) })
  }

  function commit() {
    if (typed !== null) {
      const parsed = parseKickoffInput(typed)
      if (parsed) onChange({ time: parsed })
    }
    setTyped(null)
  }

  const stepperButton = 'flex items-center justify-center text-[#8ba4c4] transition-colors hover:bg-[#0c1728] hover:text-white'

  return (
    <StepShell
      eyebrow={<StepEyebrow n={3} of={STEP_COUNT} />}
      title="When do you play?"
      sub={`Same slot every week. Your first match goes in the diary for the next ${draft.day}.`}
      action={
        <>
          <button type="button" className={PRIMARY_BUTTON} disabled={submitting} onClick={onSubmit}>
            {submitting ? 'Creating…' : 'Create league'}
          </button>
          {error && <p role="alert" className="mt-3 text-center font-inter-body text-[13px] text-[#e2686f]">{error}</p>}
        </>
      }
    >
      <p className="mb-2 font-inter-body text-sm text-[#8ba4c4]">Match day</p>
      <div className="grid grid-cols-7 gap-1.5">
        {DAYS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={draft.day === d}
            onClick={() => onChange({ day: d })}
            className={cn(
              'h-11 rounded-lg border font-plex text-[10px] font-bold uppercase tracking-[.1em] transition-colors hover:border-[#38bdf8]',
              draft.day === d ? 'border-[#38bdf8] bg-[rgba(8,47,73,.6)] text-[#7dd3fc]' : 'border-[#1b2c46] bg-[#0a1421] text-[#8ba4c4]',
            )}
          >
            {d.slice(0, 3)}
          </button>
        ))}
      </div>

      <p className="mb-2 mt-5 font-inter-body text-sm text-[#8ba4c4]">Kick-off</p>
      <div
        className={cn(
          'grid h-[50px] grid-cols-[56px_1fr_56px] overflow-hidden rounded-lg border bg-[#0a1421]',
          invalid ? 'border-[rgba(226,104,111,.6)]' : 'border-[#1b2c46]',
        )}
      >
        <button type="button" aria-label="15 minutes earlier" onClick={() => step(-15)} className={cn(stepperButton, 'border-r border-[#1b2c46]')}>
          <Minus className="size-5" />
        </button>
        <div className="flex items-center justify-center gap-1">
          <input
            aria-label="Kick-off time"
            className="w-[68px] bg-transparent text-right font-plex text-lg font-bold text-[#f4f9ff] focus:outline-none"
            value={typed ?? display}
            onFocus={() => setTyped(display)}
            onChange={(e) => setTyped(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { commit(); e.currentTarget.blur() }
              if (e.key === 'ArrowUp') { e.preventDefault(); step(15) }
              if (e.key === 'ArrowDown') { e.preventDefault(); step(-15) }
            }}
          />
          <span className="font-plex text-[13px] font-bold text-[#8ba4c4]">{suffix}</span>
        </div>
        <button type="button" aria-label="15 minutes later" onClick={() => step(15)} className={cn(stepperButton, 'border-l border-[#1b2c46]')}>
          <Plus className="size-5" />
        </button>
      </div>
    </StepShell>
  )
}
```

- [ ] **Step 5: Page**

Next rejects two dynamic segments with different names at one level (`[[...step]]` beside `[slug]`), so one page serves every `/new` URL and dispatches on the segments. Task 9 adds the Live branch.

```tsx
// app/new/[[...step]]/page.tsx
import type { Metadata } from 'next'
import { NewLeagueWizard } from '@/components/new-league/NewLeagueWizard'

export const metadata: Metadata = { title: 'Create a league' }

/** /new, /new/name, /new/where, /new/when. The proxy has already required a session and a profile. */
export default function NewLeaguePage() {
  return <NewLeagueWizard />
}
```

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. If lint flags the `react-hooks/exhaustive-deps` rule on the slug effect, the dependency list `[draft.name]` is already complete; do not disable the rule.

- [ ] **Step 7: Click through in the browser**

Run `npm run dev`, sign in, open `http://localhost:3000/new`. Check:
- The navbar is hidden and the frame is centred.
- Typing a name updates the slug line; a name that already exists (`Craft Football`) shows `craft-football-2`.
- Continue moves the URL to `/new/where`, then `/new/when`; the browser back button returns to the previous step with the answer still filled in.
- Reloading `/new/when` returns to `/new/name`.
- The stepper's minus and plus move by 15 minutes; typing `8.30pm` and pressing Enter shows `8:30 pm`; typing `abc` turns the border red and blur restores the time.
Do **not** press Create league yet (that writes to the production database); Task 11 covers the live check.

- [ ] **Step 8: Commit**

```bash
git add components/new-league app/new
git commit -m "Add the league setup wizard: name, where and when

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Live screen

**Files:**
- Create: `components/new-league/LiveShareCard.tsx`
- Create: `components/new-league/LiveScreen.tsx`
- Modify: `app/new/[[...step]]/page.tsx`

- [ ] **Step 1: Share card (client)**

```tsx
// components/new-league/LiveShareCard.tsx
'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { OUTLINE_BUTTON, PRIMARY_BUTTON } from './StepShell'

interface Props {
  leagueName: string
  /** The public league page. Never expires and admits nobody without approval. */
  url: string
  /** Roster names not yet linked to an account (the creator is excluded). */
  names: string[]
  /** Full day name, or null when the league has none. */
  day: string | null
}

function initials(name: string): string {
  return name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}

export function LiveShareCard({ leagueName, url, names, day }: Props) {
  const [copied, setCopied] = useState(false)
  const matchDay = day ?? 'match day'

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  async function share() {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: leagueName, url }).catch(() => {})
    } else {
      await copy()
    }
  }

  return (
    <section className="rounded-[14px] border border-[rgba(56,189,248,.45)] p-5 shadow-[0_18px_44px_rgba(0,0,0,.42),0_0_0_6px_rgba(56,189,248,.06)]">
      <p className="font-plex text-[9px] font-bold uppercase tracking-[.2em] text-[#7dd3fc]">One thing left</p>
      <h2 className="mt-2 text-xl font-bold tracking-[-.02em] text-[#f4f9ff]">Get your players in</h2>
      <p className="mt-2 font-inter-body text-sm leading-[1.5] text-[#8ba4c4]">
        {names.length === 0
          ? `Just you so far. One link to the group chat and your players pick their names, see the table and get picked for ${matchDay}.`
          : `${names.length} ${names.length === 1 ? 'player' : 'players'} on your roster, none of them in yet. One link to the group chat and they pick their name, see the table and get picked for ${matchDay}.`}
      </p>
      {names.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {names.map((n) => (
            <li key={n} className="flex h-[30px] items-center gap-2 rounded-full border border-dashed border-[#2c4a72] pl-1 pr-3 font-inter-body text-xs text-[#cfe0f4]">
              <span className="flex size-[22px] items-center justify-center rounded-full bg-[#1b2c46] font-plex text-[9px] font-bold text-[#f4f9ff]">{initials(n)}</span>
              {n.split(' ')[0]}
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={share} className={cn(PRIMARY_BUTTON, 'mt-5 h-[52px] gap-2')}>
        <Share2 className="size-4" />
        Share with the group
      </button>
      <div className="mt-3 flex gap-2">
        <code className="flex h-11 min-w-0 flex-1 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-[#1b2c46] bg-[#0c1728] px-3 font-plex text-xs text-[#8ba4c4]">
          {url}
        </code>
        <button type="button" onClick={copy} className={cn(OUTLINE_BUTTON, 'h-11 w-auto min-w-[88px] px-3 text-[13px]')}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <p className="mt-3 font-inter-body text-[12.5px] leading-[1.5] text-[#6f88a8]">
        Anyone with the link can ask to join and pick their name. You approve them in one tap, and their stats follow them. You can share it any time from Settings.
      </p>
    </section>
  )
}
```

- [ ] **Step 2: Live screen (server component)**

```tsx
// components/new-league/LiveScreen.tsx
import Link from 'next/link'
import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getAuthAndRole, getGameBySlug } from '@/lib/fetchers'
import { createServiceClient } from '@/lib/supabase/service'
import { dayNameToIndex, nextOccurrenceAfterToday, parseWeekDate } from '@/lib/dates'
import { leagueLandingPath, VIEWPORT_COOKIE } from '@/lib/utils'
import { OUTLINE_BUTTON, StepShell } from './StepShell'
import { LiveShareCard } from './LiveShareCard'

const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** '30 Oct 2026' → 'Thursday 30 Oct'. */
function formatLong(date: string): string {
  const [d, m] = date.split(' ')
  return `${DAY_LONG[parseWeekDate(date).getDay()]} ${parseInt(d, 10)} ${m}`
}

/** The screen after creation. Admins only; everyone else goes to the league itself. */
export async function LiveScreen({ slug }: { slug: string }) {
  const game = await getGameBySlug(slug)
  if (!game) notFound()

  const landing = leagueLandingPath(slug, (await headers()).get('user-agent'), (await cookies()).get(VIEWPORT_COOKIE)?.value)
  const { userRole } = await getAuthAndRole(game.id)
  if (userRole !== 'creator' && userRole !== 'admin') redirect(landing)

  const service = createServiceClient()
  const [{ data: roster }, { data: claims }] = await Promise.all([
    service.from('player_attributes').select('name').eq('game_id', game.id).order('name'),
    service.from('player_claims').select('player_name').eq('game_id', game.id).eq('status', 'approved'),
  ])
  const claimed = new Set((claims ?? []).map((c) => c.player_name as string))
  const names = (roster ?? []).map((r) => r.name as string).filter((n) => !claimed.has(n))

  const dayIndex = dayNameToIndex(game.day)
  const nextDate = dayIndex === null ? null : nextOccurrenceAfterToday(dayIndex)

  return (
    <StepShell
      eyebrow={
        <span className="inline-flex items-center gap-2 rounded-full border border-[#bef264]/40 bg-[#bef264]/10 px-3 py-1 font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#bef264]">
          <span className="size-1.5 animate-pulse rounded-full bg-[#bef264]" />
          League created
        </span>
      }
      title={<>{game.name}<br /><span className="text-[#bef264]">is live.</span></>}
      sub={nextDate ? `Week 1 is in the diary for ${formatLong(nextDate)}.` : 'Set a match day in Settings to put week 1 in the diary.'}
      action={<Link href={landing} className={OUTLINE_BUTTON}>Go to {game.name}</Link>}
    >
      <LiveShareCard leagueName={game.name} url={`https://craft-football.com/${slug}`} names={names} day={game.day} />
    </StepShell>
  )
}
```

`getGameBySlug` returns the row typed from `GAME_COLUMNS` (`id, name, slug, location, day, kickoff_time, bio`); if `game.day` is typed as `string | null` the call to `dayNameToIndex` already accepts null.

- [ ] **Step 3: Dispatch from the page**

Replace `app/new/[[...step]]/page.tsx` with:

```tsx
// app/new/[[...step]]/page.tsx
import type { Metadata } from 'next'
import { NewLeagueWizard } from '@/components/new-league/NewLeagueWizard'
import { LiveScreen } from '@/components/new-league/LiveScreen'

interface Props {
  params: Promise<{ step?: string[] }>
}

const isLive = (step: string[]) => step.length === 2 && step[1] === 'live'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { step = [] } = await params
  return { title: isLive(step) ? 'League created' : 'Create a league' }
}

/**
 * Every /new URL. /new, /new/name, /new/where and /new/when render the wizard;
 * /new/[slug]/live renders the Live screen. One page because Next rejects
 * sibling dynamic segments with different names. The proxy has already
 * required a session and a profile.
 */
export default async function NewLeaguePage({ params }: Props) {
  const { step = [] } = await params
  if (isLive(step)) return <LiveScreen slug={step[0]} />
  return <NewLeagueWizard />
}
```

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Check the page against an existing league**

With `npm run dev` running and signed in as an admin of `craft-football`, open `http://localhost:3000/new/craft-football/live`. Check the pill, the two-line title, the sub with next Thursday's date, the roster chips (unclaimed players only), Copy link flips to "Copied", and "Go to Craft Football" lands on the league. Signed out, the same URL redirects to the league. This reads production data but writes nothing.

- [ ] **Step 6: Commit**

```bash
git add components/new-league/LiveShareCard.tsx components/new-league/LiveScreen.tsx app/new
git commit -m "Add the Live screen with the public league link

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Entry points

**Files:**
- Modify: `app/page.tsx:11, 182-184, 186-230`
- Modify: `components/ui/navbar.tsx:7, 301-308`

- [ ] **Step 1: Your leagues**

Change the lucide import on line 11 to `import { ChevronRight, Plus } from 'lucide-react'`.

Replace the empty-state paragraph

```tsx
            <p className="mt-6 font-inter-body text-[13px] text-[#6f88a8]">You&apos;re not in any leagues yet.</p>
```

with

```tsx
            <div className="mt-6">
              <p className="font-inter-body text-[13px] text-[#6f88a8]">You&apos;re not in any leagues yet.</p>
              <Link
                href="/new"
                className="mt-4 inline-flex h-10 items-center gap-2 rounded bg-[#38bdf8] px-4 text-[13px] font-bold text-[#05101d] transition-colors hover:bg-[#7dd3fc]"
              >
                <Plus className="size-4" />
                Create a league
              </Link>
            </div>
```

Inside the `<div className="mt-6 flex flex-col gap-2">` list, after the closing `))}` of `leagueCards.map(...)` and before the `</div>`, add:

```tsx
              <Link
                href="/new"
                className="flex items-center justify-between gap-4 rounded-xl border border-dashed border-[#223a5c] px-[18px] py-4 text-[15px] font-bold text-[#8ba4c4] transition-colors hover:border-[#38bdf8] hover:text-[#f4f9ff]"
              >
                Create a league
                <Plus className="size-4 shrink-0" />
              </Link>
```

- [ ] **Step 2: Avatar menu**

Change the lucide import on line 7 of `components/ui/navbar.tsx` to `import { Settings, LogOut, Plus } from 'lucide-react'`. Directly above the `Account Settings` link inside the sheet add:

```tsx
                    <Link
                      href="/new"
                      className="flex items-center gap-2 text-sm font-bold text-[#f4f9ff]"
                      onClick={() => setSheetOpen(false)}
                    >
                      <Plus className="size-4" />
                      Create a league
                    </Link>
```

- [ ] **Step 3: Type-check, lint, look**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. In the dev server, open the avatar menu on any league page and confirm the item appears above Account Settings and leads to `/new`. (The Your leagues page only renders for users with zero or two or more leagues; one league redirects straight to it.)

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx components/ui/navbar.tsx
git commit -m "Link to league creation from Your leagues and the avatar menu

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Verify, build, live check

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all suites pass.

- [ ] **Step 2: Build and bundle report**

Run: `npm run build && npm run bundle-report`
Expected: build succeeds; the shared baseline stays under 80 kB and `/new/[[...step]]` is a small route (the wizard has no heavy imports).

- [ ] **Step 3: Apply the migration**

Run `supabase/migrations/20261027000001_create_league.sql` in the Supabase SQL editor for the production project. Confirm with:

```sql
select proname, pg_get_function_identity_arguments(oid) from pg_proc where proname in ('create_game', 'claim_profile');
```

Expected: one `create_game` row with six text arguments, one `claim_profile` row.

- [ ] **Step 4: Live check (writes to production)**

Signed in on `npm run dev`, go through `/new` and create a league named `Setup Test Will` with any venue, Thursday, 20:00. Check:
- Live shows "Setup Test Will / is live.", the next Thursday, no roster chips, the copy and share buttons work.
- The league's Results tab shows no unrecorded week.
- Settings → Players lists you as a player and Members shows you linked to it.
- Rename the league in Settings and confirm the URL stays `/setup-test-will`.
Then delete the test league's rows (`games` cascades to members, players, claims) in the SQL editor:

```sql
delete from games where slug = 'setup-test-will';
```

- [ ] **Step 5: Open the PR**

```bash
git push -u origin HEAD
gh pr create --base main --title "League creation 1/5: create path, wizard shell and Live screen" --body "$(cat <<'EOF'
## Summary
- Rewrites `create_game` to take name, slug, venue, day, kick-off and bio, add the creator as member and player, and copies first and last name in `claim_profile`
- Adds `POST /api/games` and a slug preview route; the details PATCH no longer regenerates the slug on rename
- Adds the `/new` wizard (Name, Where, When) and `/new/[slug]/live`, plus entry points on Your leagues and the avatar menu
- `ensureUnrecordedWeek` no longer stamps a brand-new league with a missed week

Spec: docs/superpowers/specs/2026-10-27-league-creation-slice-1-design.md
Handoff: docs/superpowers/specs/2026-10-27-league-creation-handoff.md

## Deploy note
Run `supabase/migrations/20261027000001_create_league.sql` in the SQL editor before this deploys.

## Test plan
- [ ] `npm test`
- [ ] Create a league end to end on local dev, check Results has no unrecorded week, rename keeps the URL

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
