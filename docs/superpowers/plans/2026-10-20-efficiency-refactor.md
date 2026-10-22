# Efficiency Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the per-page cost of the site on three fronts: the JavaScript every page ships, the round trips each request makes to Supabase Auth and the database, and the client-side fetch waterfalls on the settings pages, then tidy the modules that make the code hard to work in.

**Architecture:** Server components already own the league data path through request-cached fetchers in `lib/fetchers.ts`. This plan pushes the remaining client-side data work (navbar identity, settings pages, the next match card's seed, result and line-up writes) onto that same path, lazy-loads the Supabase browser SDK so it leaves the shared bundle, verifies sessions locally with JWT claims instead of a network call, and finally adds a tagged cross-request cache over the public league reads. The last release splits the utilities module by domain.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (`@supabase/ssr` 0.10, `supabase-js` 2.102), Jest 30 with ts-jest, Tailwind v4.

---

## Baseline (measured 2026-10-20 on `main` at b42c5a0)

Gzipped client JavaScript per route, from `next build` plus the manifest script added in Task 1:

| Route | Client JS (gz) |
|---|---|
| `/[slug]/results` | 171 kB |
| `/[slug]/overview` | 162 kB |
| Every other route, including `/_not-found` | 129 kB |
| Of the 129 kB baseline, `@supabase/supabase-js` with gotrue, postgrest and realtime | 58 kB |

Other baseline facts the tasks rely on:

- Test suite: 113 files, 1,308 tests, about 8 s. ts-jest already runs transpile-only because `tsconfig.json` sets `isolatedModules: true`. The "speed up tests" idea from the investigation is therefore dropped from this plan.
- Two suites fail on `main` before any change: `lib/__tests__/utils.shareLinks.test.ts` ("skips a game day that has been cancelled") and `lib/__tests__/email.notifications.test.ts` (two subject-line tests). They are date-sensitive and unrelated to this work. Leave them, and do not count them as regressions.
- `auth.getUser()` makes a network call to Supabase Auth on every server render, every proxy pass for guarded routes, and every API call.
- The navbar fetches `/api/auth/me` and `/api/games` on every page load and client navigation.
- On the member and admin Results tab, `NextMatchCard` ignores the `initialScheduledWeek` the page computed and reads `weeks` again from the browser with the Supabase client.
- `lib/data.ts` `fetchWeeks` and `fetchPlayers`, and the routes `/api/weeks` and `/api/players`, have no callers. `fetchGames` has one caller, the league settings page.

## Releases, PRs and order

Each release is a set of PRs merged to `main`, a version bump in `package.json`, and one run of the "Deploy to Production" GitHub workflow. Each PR is independently revertible. Within a release the PRs are listed in merge order because later ones build on earlier ones.

| Release | Version | PRs | Theme |
|---|---|---|---|
| 1 | 0.4.0 | PR 1, PR 2 | Housekeeping: dead code, legacy routes, shared admin gate, bundle report |
| 2 | 0.5.0 | PR 3, PR 4, PR 5 | Navbar from the server, lazy auth forms, next match card from the server seed |
| 3 | 0.6.0 | PR 6, PR 7 | Settings pages rendered on the server |
| 4 | 0.7.0 | PR 8, PR 9 | Local JWT verification, slimmer proxy |
| 5 | 0.8.0 | PR 10, PR 11 | Writes through API routes, tagged league cache |
| 6 | 0.9.0 | PR 12 | Split `lib/utils.ts` by domain |

Branch naming: `refactor/pr-<n>-<slug>`, for example `refactor/pr-3-navbar-session`. Open each PR against `main` with `gh pr create --base main`.

### Release checklist (run for every release)

- [ ] All PRs for the release merged to `main`.
- [ ] `npm test` passes except the two pre-existing failures listed above.
- [ ] `npm run build` succeeds and `npm run bundle-report` is pasted into the release PR or notes.
- [ ] Bump `version` in `package.json` on a one-line PR titled `Release 0.x.0`.
- [ ] Smoke test on the Vercel preview of that PR, signed out and signed in as an admin: `/`, `/craft-football/results`, `/craft-football/overview`, `/craft-football/settings`, `/settings`, build a line-up, record a result, cancel a game.
- [ ] Merge, then run the "Deploy to Production" workflow from the Actions tab.

### Conventions used by every task

- Run tests with `npm test -- <path>`; the `--` is required so Jest receives the path.
- Commit messages are imperative, one line, no prefix, matching the repository history ("Serve the navbar session from the server").
- British English in copy. No em dashes in UI copy.
- Server-only modules end in `Server.ts` or live under `lib/supabase/`. Never import `lib/supabase/service` or `lib/supabase/server` from a client component.
- Every new or moved function keeps the comment style already used in the file it lands in.

---

# Release 1 (0.4.0): Housekeeping

## PR 1: Bundle report, dead code and legacy routes

Branch: `refactor/pr-1-housekeeping`

### Task 1: Add the bundle report script

**Files:**
- Create: `scripts/bundle-report.mjs`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Create the script**

```js
// scripts/bundle-report.mjs
// Sums the gzipped size of every client chunk each app route references.
// Run after `next build`. Turbopack names chunks opaquely, so this reads the
// per-route client reference manifests instead of guessing from file names.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const ROOT = '.next'
const APP = join(ROOT, 'server', 'app')

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

const gz = new Map()
function gzipSize(file) {
  if (!gz.has(file)) {
    try {
      gz.set(file, gzipSync(readFileSync(file)).length)
    } catch {
      console.warn(`Missing chunk: ${file}`)
      gz.set(file, 0)
    }
  }
  return gz.get(file)
}

try {
  statSync(APP)
} catch {
  console.error('No build found. Run `npm run build` first.')
  process.exit(1)
}

const rows = walk(APP)
  .filter((file) => file.endsWith('_client-reference-manifest.js'))
  .map((file) => {
    const source = readFileSync(file, 'utf8')
    const chunks = new Set([...source.matchAll(/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]))
    const bytes = [...chunks].reduce((sum, chunk) => sum + gzipSize(join(ROOT, chunk)), 0)
    const route = file.slice(APP.length).replace('_client-reference-manifest.js', '')
    return { route, bytes, chunks: chunks.size }
  })
  .sort((a, b) => b.bytes - a.bytes)

console.log('Client JS per route (gzipped)')
const shown = rows.filter((row) => row.chunks > 0)
const skipped = rows.length - shown.length
for (const { route, bytes, chunks } of shown) {
  console.log(`${String(Math.round(bytes / 1024)).padStart(5)} kB  ${route}  (${chunks} chunks)`)
}
console.log(`${skipped} routes with no client JS`)
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, add after `"build"`:

```json
"bundle-report": "node scripts/bundle-report.mjs",
```

- [ ] **Step 3: Run it against a fresh build**

Run: `npm run build && npm run bundle-report`
Expected: a table whose top rows match the baseline (`/[slug]/(tabs)/results/page` at about 171 kB, `/_not-found/page` at about 129 kB).

- [ ] **Step 4: Commit**

```bash
git add scripts/bundle-report.mjs package.json
git commit -m "Add a per-route client bundle report"
```

### Task 2: Remove the unused access-key data path

**Files:**
- Modify: `lib/data.ts`
- Delete: `app/api/weeks/route.ts`, `app/api/players/route.ts`

- [ ] **Step 1: Confirm there are no callers**

Run: `grep -rn "fetchWeeks\|fetchPlayers\|/api/weeks\|/api/players" app components lib --include='*.ts' --include='*.tsx' | grep -v "lib/data.ts"`
Expected: no output.

- [ ] **Step 2: Reduce `lib/data.ts` to the one function still in use**

Replace the whole file with:

```ts
/**
 * The signed-in user's leagues, via the API route so the cookie session is
 * used. Only the league settings page calls this; PR 6 removes it.
 */
import type { Game } from '@/lib/types'

export async function fetchGames(): Promise<Game[]> {
  const res = await fetch('/api/games', { credentials: 'include' })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  return (data ?? []) as Game[]
}
```

- [ ] **Step 3: Delete the two routes**

```bash
git rm app/api/weeks/route.ts app/api/players/route.ts
```

- [ ] **Step 4: Type-check and test**

Run: `npx tsc --noEmit && npm test -- --silent 2>&1 | tail -5`
Expected: tsc exits 0; the Jest summary shows only the two pre-existing failing suites.

- [ ] **Step 5: Commit**

```bash
git add -A lib/data.ts app/api
git commit -m "Remove the unused access-key data path"
```

### Task 3: Collapse the five legacy redirect routes into two

**Files:**
- Create: `app/app/league/[id]/[[...rest]]/page.tsx`
- Create: `app/results/[id]/[[...rest]]/page.tsx`
- Delete: `app/app/league/[id]/page.tsx`, `app/app/league/[id]/players/page.tsx`, `app/app/league/[id]/settings/page.tsx`, `app/results/[id]/page.tsx`, `app/results/[id]/players/page.tsx`

- [ ] **Step 1: Write the shared redirect helper test**

Create `lib/__tests__/legacyRedirect.test.ts`:

```ts
import { legacyLeaguePath } from '@/lib/legacyRedirect'

describe('legacyLeaguePath', () => {
  it('sends the league root to the league root', () => {
    expect(legacyLeaguePath('boot-room', undefined)).toBe('/boot-room')
  })
  it('keeps players and settings sub-paths', () => {
    expect(legacyLeaguePath('boot-room', ['players'])).toBe('/boot-room/players')
    expect(legacyLeaguePath('boot-room', ['settings'])).toBe('/boot-room/settings')
  })
  it('drops anything it does not recognise', () => {
    expect(legacyLeaguePath('boot-room', ['old', 'thing'])).toBe('/boot-room')
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- lib/__tests__/legacyRedirect.test.ts`
Expected: FAIL, cannot find module `@/lib/legacyRedirect`.

- [ ] **Step 3: Add the helper**

Create `lib/legacyRedirect.ts`:

```ts
// Old URLs were /app/league/<uuid>[/players|/settings] and /results/<uuid>[/players].
// Both now redirect to the slug-based league pages.
const KNOWN_SUBPATHS = new Set(['players', 'settings'])

export function legacyLeaguePath(slug: string, rest: string[] | undefined): string {
  const sub = rest?.[0]
  return sub && KNOWN_SUBPATHS.has(sub) ? `/${slug}/${sub}` : `/${slug}`
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- lib/__tests__/legacyRedirect.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Create the two catch-all pages**

`app/app/league/[id]/[[...rest]]/page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { getGame } from '@/lib/fetchers'
import { legacyLeaguePath } from '@/lib/legacyRedirect'

interface Props {
  params: Promise<{ id: string; rest?: string[] }>
}

/** /app/league/<uuid>[/players|/settings] → /<slug>[/players|/settings] */
export default async function LegacyLeaguePage({ params }: Props) {
  const { id, rest } = await params
  const game = await getGame(id)
  if (!game) notFound()
  redirect(legacyLeaguePath(game.slug, rest))
}
```

`app/results/[id]/[[...rest]]/page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { getGame } from '@/lib/fetchers'
import { legacyLeaguePath } from '@/lib/legacyRedirect'

interface Props {
  params: Promise<{ id: string; rest?: string[] }>
}

/** /results/<uuid>[/players] → /<slug>[/players] */
export default async function LegacyResultsPage({ params }: Props) {
  const { id, rest } = await params
  const game = await getGame(id)
  if (!game) notFound()
  redirect(legacyLeaguePath(game.slug, rest))
}
```

- [ ] **Step 6: Delete the old files**

```bash
git rm 'app/app/league/[id]/page.tsx' 'app/app/league/[id]/players/page.tsx' 'app/app/league/[id]/settings/page.tsx' 'app/results/[id]/page.tsx' 'app/results/[id]/players/page.tsx'
```

- [ ] **Step 7: Build to confirm the routes resolve**

Run: `npm run build 2>&1 | grep -E "app/league|results/\["`
Expected: exactly two lines, `/app/league/[id]/[[...rest]]` and `/results/[id]/[[...rest]]`.

- [ ] **Step 8: Commit**

```bash
git add -A app/app app/results lib/legacyRedirect.ts lib/__tests__/legacyRedirect.test.ts
git commit -m "Collapse the legacy league redirects into two catch-alls"
```

### Task 4: Correct the stale parts of CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace the repository structure block**

Replace the `app/` subtree in the "Repository structure" code block with:

```
├── app/
│   ├── [slug]/               # Public league pages: (tabs)/overview, results, players, honours, records, lineup-lab, admin; settings
│   ├── app/league/[id]/      # Legacy UUID URLs, redirect to /[slug]
│   ├── results/[id]/         # Legacy UUID URLs, redirect to /[slug]
│   ├── settings/             # Account settings
│   ├── invite/               # Invite accept page (consumes ?token=)
│   ├── api/                  # API routes
│   └── globals.css           # Tailwind import, theme tokens, font utilities
```

- [ ] **Step 2: Replace the "Auth and access model" bullets**

Replace the first three bullets of that section with:

```
- **Proxy** (`proxy.ts`, Next 16's name for middleware) guards `/settings` and `/[slug]/settings`
- `/settings` requires a Supabase session with a `profiles` row; `/[slug]/settings` requires a session and a creator or admin role in that league
- Unauthenticated → redirect to `/sign-in?redirect=...`; authenticated but no profile → `/profile-required`
- Every other page is public and renders read-only for signed-out visitors
```

- [ ] **Step 3: Add the bundle report to the file**

Under "Tech stack", after the table, add:

```
Run `npm run build && npm run bundle-report` to see gzipped client JavaScript per route. The shared baseline should stay under 80 kB; see docs/superpowers/plans/2026-10-20-efficiency-refactor.md.
```

- [ ] **Step 4: Commit and open the PR**

```bash
git add CLAUDE.md
git commit -m "Bring CLAUDE.md in line with the current routes and proxy"
git push -u origin refactor/pr-1-housekeeping
gh pr create --base main --title "Housekeeping: bundle report, dead code, legacy routes" --body "$(cat <<'EOF'
Release 1 of the efficiency refactor (docs/superpowers/plans/2026-10-20-efficiency-refactor.md).

- Adds `npm run bundle-report` (gzipped client JS per route)
- Removes the unused access-key data path (`fetchWeeks`, `fetchPlayers`, `/api/weeks`, `/api/players`)
- Collapses five legacy UUID redirect routes into two catch-alls
- Corrects the routes and proxy description in CLAUDE.md

No user-facing change.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## PR 2: One admin gate for every API route

Branch: `refactor/pr-2-api-auth` (from `main` after PR 1 merges)

Nine routes repeat "get the user, call `is_game_admin`, return 401 or 403" by hand, and four fee routes already use `requireLeagueAdmin` from `lib/feesServer.ts`. This PR moves the helper to its own module, adds `requireUser` for the routes that only need a session, and converts every route.

### Task 5: Create `lib/apiAuth.ts` with tests

**Files:**
- Create: `lib/apiAuth.ts`
- Create: `__tests__/api-auth.test.ts`
- Modify: `lib/feesServer.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/api-auth.test.ts
import { createClient } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

import { requireUser, requireLeagueAdmin } from '@/lib/apiAuth'

const rpc = jest.fn()

function setup(user: { id: string; email?: string } | null, isAdmin = false) {
  rpc.mockResolvedValue({ data: isAdmin, error: null })
  ;(createClient as jest.Mock).mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) },
    rpc,
  })
}

beforeEach(() => rpc.mockReset())

describe('requireUser', () => {
  it('returns the user id and email when signed in', async () => {
    setup({ id: 'u1', email: 'a@example.com' })
    await expect(requireUser()).resolves.toEqual({ user: { id: 'u1', email: 'a@example.com' } })
  })

  it('returns a 401 response when signed out', async () => {
    setup(null)
    const result = await requireUser()
    expect('response' in result && result.response.status).toBe(401)
  })
})

describe('requireLeagueAdmin', () => {
  it('returns the user for a league admin', async () => {
    setup({ id: 'u1', email: 'a@example.com' }, true)
    await expect(requireLeagueAdmin('g1')).resolves.toEqual({ user: { id: 'u1', email: 'a@example.com' } })
    expect(rpc).toHaveBeenCalledWith('is_game_admin', { p_game_id: 'g1' })
  })

  it('returns a 403 response for a member', async () => {
    setup({ id: 'u1' }, false)
    const result = await requireLeagueAdmin('g1')
    expect('response' in result && result.response.status).toBe(403)
  })

  it('returns a 401 response when signed out without calling the RPC', async () => {
    setup(null)
    const result = await requireLeagueAdmin('g1')
    expect('response' in result && result.response.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- __tests__/api-auth.test.ts`
Expected: FAIL, cannot find module `@/lib/apiAuth`.

- [ ] **Step 3: Create the module**

```ts
// lib/apiAuth.ts
// The session and admin gates shared by every API route. Both return either
// the caller or the response to send back, so a handler reads as
//   const gate = await requireLeagueAdmin(id)
//   if ('response' in gate) return gate.response
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** The subset of the session a route handler needs. */
export interface ApiUser {
  id: string
  email: string | null
}

type Gate = { user: ApiUser } | { response: NextResponse }

/** The signed-in caller, or a 401. */
export async function requireUser(): Promise<Gate> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  return { user: { id: user.id, email: user.email ?? null } }
}

/** The signed-in caller if they admin this league (via is_game_admin), else a 401 or 403. */
export async function requireLeagueAdmin(leagueId: string): Promise<Gate> {
  const gate = await requireUser()
  if ('response' in gate) return gate
  const supabase = await createClient()
  const { data: isAdmin } = await supabase.rpc('is_game_admin', { p_game_id: leagueId })
  if (!isAdmin) return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return gate
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- __tests__/api-auth.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Point `lib/feesServer.ts` at the new module**

Remove the `requireLeagueAdmin` function and its two imports (`NextResponse`, `User`) from `lib/feesServer.ts`, and add at the top:

```ts
export { requireLeagueAdmin } from '@/lib/apiAuth'
```

The four fee routes keep importing from `@/lib/feesServer`, so they need no change. Keep the `createClient` import only if something else in the file still uses it; nothing does, so remove it too.

- [ ] **Step 6: Run the fee route tests**

Run: `npm test -- __tests__/fees-routes.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/apiAuth.ts lib/feesServer.ts __tests__/api-auth.test.ts
git commit -m "Share the API session and admin gates in lib/apiAuth"
```

### Task 6: Convert the nine routes that call `is_game_admin` by hand

**Files:**
- Modify: `app/api/league/[id]/weeks/[weekId]/route.ts`
- Modify: `app/api/league/[id]/weeks/[weekId]/edit/route.ts`
- Modify: `app/api/league/[id]/players/route.ts` (GET and POST)
- Modify: `app/api/league/[id]/players/[name]/route.ts`
- Modify: `app/api/league/[id]/players/[name]/rename/route.ts`
- Modify: `app/api/league/[id]/guests/name/route.ts`
- Modify: `app/api/league/[id]/details/route.ts` (PATCH)
- Modify: `app/api/league/[id]/features/route.ts` (PATCH)
- Modify: `app/api/invites/route.ts`

In each handler the block below (variable names vary slightly, the shape is the same):

```ts
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

const { data: isAdmin } = await supabase.rpc('is_game_admin', { p_game_id: id })
if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

becomes:

```ts
const gate = await requireLeagueAdmin(id)
if ('response' in gate) return gate.response
const supabase = await createClient()
```

Keep the `createClient()` line only when the handler goes on to use `supabase` (most do, for their RPC). Where the handler later reads `user.id` or `user.email`, use `gate.user.id` or `gate.user.email`. Add `import { requireLeagueAdmin } from '@/lib/apiAuth'` to each file.

- [ ] **Step 1: Convert `weeks/[weekId]/route.ts` first as the model**

The whole file becomes:

```ts
import { createServiceClient } from '@/lib/supabase/service'
import { requireLeagueAdmin } from '@/lib/apiAuth'
import { NextResponse } from 'next/server'

/** PATCH — admin-only, updates the date on a scheduled week. Body: { date: "DD MMM YYYY" } */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; weekId: string }> }
) {
  const { id, weekId } = await params
  const gate = await requireLeagueAdmin(id)
  if ('response' in gate) return gate.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const b = body as Record<string, unknown>
  const date = typeof b.date === 'string' ? b.date.trim() : ''
  if (!date || !/^\d{2} [A-Za-z]{3} \d{4}$/.test(date)) {
    return NextResponse.json({ error: 'date must be "DD MMM YYYY" format' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('weeks')
    .update({ date })
    .eq('id', weekId)
    .eq('game_id', id)
    .eq('status', 'scheduled')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Convert the other eight with the same substitution**

For `app/api/invites/route.ts` the league id comes from the body (`gameId`), so read the body first and then call `requireLeagueAdmin(gameId)`. The 400 for a missing `gameId` must come before the gate so its tests keep their order.

- [ ] **Step 3: Run every route test**

Run: `npm test -- __tests__ --silent 2>&1 | tail -5`
Expected: all suites under `__tests__` pass (the two pre-existing failures are under `lib/__tests__`).

- [ ] **Step 4: Grep to confirm nothing calls the RPC by hand any more**

Run: `grep -rln "rpc('is_game_admin'" app/api`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add app/api
git commit -m "Gate admin API routes through requireLeagueAdmin"
```

### Task 7: Convert the routes that only need a session

**Files:**
- Modify: `app/api/league/[id]/members/route.ts`, `app/api/league/[id]/join-requests/route.ts`, `app/api/league/[id]/join-requests/[requestId]/approve/route.ts`, `app/api/league/[id]/join-requests/[requestId]/review/route.ts`, `app/api/league/[id]/player-claims/route.ts`, `app/api/league/[id]/player-claims/[claimId]/route.ts`, `app/api/league/[id]/player-claims/[claimId]/approve/route.ts`, `app/api/league/[id]/player-claims/[claimId]/review/route.ts`, `app/api/league/[id]/player-claims/all/route.ts`, `app/api/league/[id]/player-claims/assign/route.ts`, `app/api/league/[id]/features/route.ts` (GET), `app/api/games/route.ts`, `app/api/auth/profile/route.ts`, `app/api/auth/account/route.ts`

- [ ] **Step 1: Replace the session check in each handler**

```ts
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

becomes:

```ts
const gate = await requireUser()
if ('response' in gate) return gate.response
const supabase = await createClient()
```

Where a handler used `authError` as well, drop it; `requireUser` already treats an error as signed out. Replace later uses of `user` with `gate.user`.

- [ ] **Step 2: Run the whole suite**

Run: `npm test -- --silent 2>&1 | tail -5`
Expected: only the two pre-existing failures.

- [ ] **Step 3: Commit and open the PR**

```bash
git add app/api
git commit -m "Gate session-only API routes through requireUser"
git push -u origin refactor/pr-2-api-auth
gh pr create --base main --title "One session and admin gate for every API route" --body "$(cat <<'EOF'
Release 1 of the efficiency refactor.

Moves `requireLeagueAdmin` out of `lib/feesServer.ts` into `lib/apiAuth.ts`, adds `requireUser`, and converts every API route to use them. Behaviour is unchanged: same status codes, same RPC. This is the seam PR 8 uses to switch session verification to local JWT claims in one place.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Release 2 (0.5.0): Navbar and bundle

## PR 3: Serve the navbar session from the server

Branch: `refactor/pr-3-navbar-session`

Today the client navbar calls `/api/auth/me` and `/api/games` after every page load and every navigation, and each of those calls Supabase Auth over the network. The root layout can resolve who the viewer is once per request, through the same request-cached `getUser` the pages use, and hand the navbar a serialisable session.

### Task 8: Add `NavSession` and `getNavSession`

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/fetchers.ts`
- Modify: `lib/__tests__/fetchers.test.ts`

- [ ] **Step 1: Add the type to `lib/types.ts`** (after `LeagueMember`)

```ts
/** What the navbar needs to know about the viewer, resolved once per request on the server. */
export interface NavSession {
  userId: string
  email: string | null
  /** "First Last", falling back to the email, as the avatar menu shows it. */
  displayName: string | null
  /** Every league the viewer belongs to, so the navbar can label the current one Admin or Member. */
  leagues: { slug: string; role: GameRole }[]
}
```

- [ ] **Step 2: Write the failing tests** (append to `lib/__tests__/fetchers.test.ts`; add `getNavSession` and `NavSession` to the existing imports)

```ts
describe('getNavSession', () => {
  it('returns null when signed out', async () => {
    mockAuth(null)
    await expect(getNavSession()).resolves.toBeNull()
  })

  it('builds the display name and league roles for a signed-in user', async () => {
    mockAuth(USER)
    const profile = queryReturning({ first_name: 'Ada', last_name: 'Lovelace' })
    const memberships = {
      select: jest.fn(() => memberships),
      eq: jest.fn().mockResolvedValue({
        data: [
          { role: 'admin', games: { slug: 'boot-room' } },
          { role: 'member', games: { slug: 'sunday' } },
        ],
        error: null,
      }),
    }
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => (table === 'profiles' ? profile : memberships)),
    })
    const session: NavSession | null = await getNavSession()
    expect(session).toEqual({
      userId: 'user-1',
      email: 'a@b.c',
      displayName: 'Ada Lovelace',
      leagues: [
        { slug: 'boot-room', role: 'admin' },
        { slug: 'sunday', role: 'member' },
      ],
    })
  })

  it('falls back to the email when the profile has no name', async () => {
    mockAuth(USER)
    const profile = queryReturning({ first_name: '', last_name: '' })
    const memberships = {
      select: jest.fn(() => memberships),
      eq: jest.fn().mockResolvedValue({ data: [], error: null }),
    }
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => (table === 'profiles' ? profile : memberships)),
    })
    await expect(getNavSession()).resolves.toMatchObject({ displayName: 'a@b.c', leagues: [] })
  })
})
```

- [ ] **Step 3: Run to confirm failure**

Run: `npm test -- lib/__tests__/fetchers.test.ts`
Expected: FAIL, `getNavSession` is not exported.

- [ ] **Step 4: Implement in `lib/fetchers.ts`** (after `getAuthAndRole`; add `NavSession` to the type import)

```ts
// ── Navbar session ────────────────────────────────────────────────────────────

// The viewer's name and league roles for the navbar. One profile read and one
// memberships read per request, both via the service client because the
// result is only ever rendered for the viewer themself.
export const getNavSession = cache(async (): Promise<NavSession | null> => {
  const user = await getUser()
  if (!user) return null
  const service = createServiceClient()
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    service.from('profiles').select('first_name, last_name').eq('id', user.id).maybeSingle(),
    service.from('game_members').select('role, games(slug)').eq('user_id', user.id),
  ])
  const first = profile?.first_name ?? ''
  const last = profile?.last_name ?? ''
  const fullName = `${first} ${last}`.trim()
  return {
    userId: user.id,
    email: user.email ?? null,
    displayName: fullName || user.email || null,
    leagues: ((memberships ?? []) as { role: GameRole; games: { slug: string } | null }[])
      .filter((m) => m.games?.slug)
      .map((m) => ({ slug: m.games!.slug, role: m.role })),
  }
})
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- lib/__tests__/fetchers.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/fetchers.ts lib/__tests__/fetchers.test.ts
git commit -m "Resolve the navbar session once per request"
```

### Task 9: Render the navbar from server props

**Files:**
- Create: `components/NavbarSession.tsx`
- Modify: `app/layout.tsx`
- Modify: `components/ui/navbar.tsx`
- Delete: `app/api/auth/me/route.ts`

- [ ] **Step 1: Create the async server wrapper**

```tsx
// components/NavbarSession.tsx
import { getNavSession } from '@/lib/fetchers'
import { Navbar } from '@/components/ui/navbar'

/**
 * Resolves the viewer on the server and renders the client navbar with the
 * result. Sits inside a Suspense boundary in the root layout, so the page
 * shell streams without waiting on the auth lookup.
 */
export async function NavbarSession() {
  const session = await getNavSession()
  return <Navbar session={session} />
}
```

- [ ] **Step 2: Wire it into `app/layout.tsx`**

Replace the `Navbar` import with:

```tsx
import { Suspense } from 'react'
import { Navbar } from '@/components/ui/navbar'
import { NavbarSession } from '@/components/NavbarSession'
```

and replace `<Navbar />` in the body with:

```tsx
<Suspense fallback={<Navbar session={null} pending />}>
  <NavbarSession />
</Suspense>
```

- [ ] **Step 3: Rewrite the state section of `components/ui/navbar.tsx`**

Replace the `NavbarProps` interface with:

```tsx
interface NavbarProps {
  logo?: {
    url: string
    src: string
    alt: string
    title: string
  }
  menu?: MenuItem[]
  mobileExtraLinks?: { name: string; url: string }[]
  /** The viewer, resolved on the server. Null when signed out. */
  session: NavSession | null
  /** True while the server is still resolving the session (Suspense fallback). */
  pending?: boolean
}
```

Add `import type { NavSession } from '@/lib/types'` and remove the `createClient` import and the `useCallback`, `useEffect`, `useRef` imports (keep `useState`).

Replace everything in the `Navbar` function body from `const [user, setUser] = useState(...)` down to and including `handleSignOut` with:

```tsx
  const [sheetOpen, setSheetOpen] = useState(false)
  const router = useRouter()

  const user = session
  const displayName = session?.displayName ?? null
  const currentRole = slug ? session?.leagues.find((l) => l.slug === slug)?.role : undefined
  const isLeagueAdmin = currentRole === 'creator' || currentRole === 'admin'

  const showNav = pathname !== '/sign-in'

  // Reset sheet open state when pathname changes (React key-based reset pattern)
  const [sheetPathname, setSheetPathname] = useState(pathname)
  if (sheetPathname !== pathname) {
    setSheetPathname(pathname)
    if (sheetOpen) setSheetOpen(false)
  }

  async function handleSignOut() {
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })
    // The server cleared the session cookies; re-render the layout so the
    // navbar and every page re-resolve as signed out.
    router.refresh()
  }
```

Replace the landing-page guard:

```tsx
  // The landing page at / ships its own header; hide the app navbar for
  // signed-out visitors (and while auth state is still resolving) there.
  if (pathname === '/' && (!authResolved || !user)) return null
```

with:

```tsx
  // The landing page at / ships its own header; hide the app navbar for
  // signed-out visitors (and while the server is still resolving) there.
  if (pathname === '/' && (pending || !user)) return null
```

In the two places that render `<AuthDialog ... />` for signed-out viewers, change the condition from `showNav && !user` to `showNav && !pending && !user`, so the fallback shows neither a Log in button nor an avatar.

Update the function signature:

```tsx
export function Navbar({
  logo = defaultLogo,
  menu = [],
  mobileExtraLinks = [],
  session,
  pending = false,
}: NavbarProps) {
```

- [ ] **Step 4: Delete the route only the navbar used**

```bash
git rm app/api/auth/me/route.ts
```

- [ ] **Step 5: Type-check, test and run the app**

Run: `npx tsc --noEmit && npm test -- --silent 2>&1 | tail -5`
Expected: tsc clean; only the two pre-existing failures.

Run: `npm run dev`, open `http://localhost:3000/craft-football/results` signed out, then sign in. Expected: no Log in button flashes before the avatar on a signed-in reload; the avatar menu shows "Admin" or "Member" under the name on league pages; "Log out" returns the page to its signed-out state without a full reload.

- [ ] **Step 6: Commit and open the PR**

```bash
git add -A app/layout.tsx components/NavbarSession.tsx components/ui/navbar.tsx app/api/auth
git commit -m "Serve the navbar session from the server"
git push -u origin refactor/pr-3-navbar-session
gh pr create --base main --title "Serve the navbar session from the server" --body "$(cat <<'EOF'
Release 2 of the efficiency refactor.

The root layout now resolves the viewer once per request (`getNavSession`, request-cached alongside `getUser`) and passes it to the navbar. This removes the two API calls the navbar made on every page load and navigation, each of which hit Supabase Auth, and the Log in → avatar flicker on signed-in loads. `/api/auth/me` had no other caller and is deleted.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## PR 4: Load the auth forms, and the Supabase browser SDK, on demand

Branch: `refactor/pr-4-lazy-auth`

`AuthDialog` is imported by the navbar in the root layout, and its three forms import the Supabase browser client. That is why 58 kB of gzipped SDK ships on every page. Moving the forms into their own module and loading them with `next/dynamic` when the dialog opens leaves only the trigger button and the Radix dialog shell in the shared bundle. The Results and Overview tabs keep the SDK until PR 10 moves their writes to API routes.

### Task 10: Split the forms out of `AuthDialog`

**Files:**
- Create: `components/AuthForms.tsx`
- Modify: `components/AuthDialog.tsx`

- [ ] **Step 1: Move the forms**

Create `components/AuthForms.tsx` containing, moved verbatim from `components/AuthDialog.tsx`: the `inputClass` constant, `VerifyStep`, `SignInForm` and `SignUpForm`. It starts:

```tsx
'use client'

// The three auth forms, in their own module so the Supabase browser client
// they need is only downloaded when someone opens the sign-in dialog.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const inputClass =
  'w-full px-4 py-2 rounded-xl bg-[#0a1421] border border-[#1b2c46] text-[#f4f9ff] placeholder:text-[#4f688a] focus:outline-none focus:ring-0 focus:border-[#38bdf8]'

export function VerifyStep({ ... }) { /* unchanged body */ }
export function SignInForm({ ... }) { /* unchanged body */ }
export function SignUpForm({ ... }) { /* unchanged body */ }
```

Each of the three functions gains the `export` keyword and is otherwise identical to today's code.

- [ ] **Step 2: Load them lazily from `AuthDialog.tsx`**

Delete the moved code from `components/AuthDialog.tsx`, remove the `createClient` import, and add:

```tsx
import dynamic from 'next/dynamic'

const formLoading = () => (
  <div className="flex justify-center py-6">
    <Spinner className="size-6" label="Loading" />
  </div>
)

const SignInForm = dynamic(() => import('./AuthForms').then((m) => m.SignInForm), { ssr: false, loading: formLoading })
const SignUpForm = dynamic(() => import('./AuthForms').then((m) => m.SignUpForm), { ssr: false, loading: formLoading })
const VerifyStep = dynamic(() => import('./AuthForms').then((m) => m.VerifyStep), { ssr: false, loading: formLoading })
```

The JSX inside the dialog that renders `<VerifyStep>`, `<SignInForm>` and `<SignUpForm>` is unchanged.

- [ ] **Step 3: Type-check and run the component tests that touch the dialog**

Run: `npx tsc --noEmit && npm test -- components/__tests__/LeagueJoinArea.share.test.tsx __tests__/loading-states.test.tsx`
Expected: PASS. If a test renders the open dialog and asserts on form fields synchronously, wrap that assertion in `await screen.findByLabelText(...)` because the form now resolves asynchronously.

- [ ] **Step 4: Measure**

Run: `npm run build && npm run bundle-report | head -20`
Expected: `/_not-found/page` and every other route that was 129 kB is now at or below about 75 kB. `/[slug]/(tabs)/results/page` and `/[slug]/(tabs)/overview/page` are unchanged within a few kB because `NextMatchCard` and `ResultModal` still import the SDK (PR 10).

Paste the top of the report into the PR description.

- [ ] **Step 5: Commit and open the PR**

```bash
git add components/AuthForms.tsx components/AuthDialog.tsx
git commit -m "Load the auth forms and the Supabase browser SDK on demand"
git push -u origin refactor/pr-4-lazy-auth
gh pr create --base main --title "Load the auth forms on demand" --body "$(cat <<'EOF'
Release 2 of the efficiency refactor.

The sign-in, sign-up and verify forms move to `components/AuthForms.tsx` and are loaded with `next/dynamic` when the dialog opens. The Supabase browser SDK (58 kB gzipped) leaves the shared bundle; the Results and Overview tabs keep it until PR 10.

Bundle report before and after:

(paste)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## PR 5: The Results tab's next match card takes the server seed

Branch: `refactor/pr-5-next-match-seed`

The Results page already computes `nextWeek` and passes it as `initialScheduledWeek`, but `NextMatchCard` only honours that prop in `publicMode` or the Overview variant. For members and admins it shows a loading skeleton and reads `weeks` again through the browser SDK. The Overview tab's `getNextMatchSeed` already encodes the same rules the browser read applies (unrecorded → idle, cancelled past kick-off → idle, scheduled past the awaiting window → idle), so the Results page can use it too and the card can drop the read.

### Task 11: Seed the Results page with `getNextMatchSeed`

**Files:**
- Modify: `app/[slug]/(tabs)/results/page.tsx`

- [ ] **Step 1: Replace the hand-rolled `nextWeek` block**

Delete from `// The next match card: editable for admins, read-only for everyone else.` through the closing `}` of `if (first && ...)`, and the `let nextWeek` declaration. Replace with:

```ts
  // The next match card's starting week. Once a game has kicked off the week
  // list's Awaiting Result card owns it (see getResultsNextMatchSeed).
  const nextWeek: ScheduledWeek | null = getResultsNextMatchSeed(weeks, game.kickoff_time ?? null)
```

Results must not use `getNextMatchSeed` directly: Overview keeps a kicked-off game on the card until the next midnight because it has no week list, but Results already renders that game as an Awaiting Result card, so the plain seed shows the same game twice with two record-result buttons. Add this helper to `lib/utils.ts` directly after `getNextMatchSeed`, with three unit tests in `lib/__tests__/utils.overview.test.ts` (upcoming → the week; kicked off yesterday → null; cancelled before kick-off → the week):

```ts
/**
 * The Results tab's starting week: getNextMatchSeed, except that a scheduled
 * game that has kicked off returns null, because the Results week list shows
 * it as an Awaiting Result card and the next match card must not show the
 * same game twice. Overview has no week list, so it keeps the awaiting window.
 */
export function getResultsNextMatchSeed(weeks: Week[], kickoffTime?: string | null): ScheduledWeek | null {
  const seed = getNextMatchSeed(weeks, kickoffTime)
  if (seed?.status === 'scheduled' && isPastDeadline(seed.date, kickoffTime)) return null
  return seed
}
```

Update the import line from `@/lib/utils` to:

```ts
import { dayNameToIndex, getLatestResultWeek, getResultsNextMatchSeed } from '@/lib/utils'
```

(`isPastDeadline` and `parseWeekDate` are no longer used here.) The deadline is evaluated on the server, as Overview and the tab title already do. Vercel reserves the `TZ` variable and runs functions in UTC, so every calendar and kick-off check goes through `leagueNow()` in `lib/utils.ts`, which reads the Europe/London wall clock explicitly.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add 'app/[slug]/(tabs)/results/page.tsx'
git commit -m "Seed the Results next match card the same way as Overview"
```

### Task 12: Remove the browser read from `NextMatchCard`

**Files:**
- Modify: `components/NextMatchCard.tsx`
- Modify: `__tests__/next-match-card-share.test.tsx`, `__tests__/upcoming-card-face-off.test.tsx`, `__tests__/match-card-kickoff.test.tsx`, `__tests__/loading-states.test.tsx` (only if they rely on the browser read)

- [ ] **Step 1: Replace the mount effect**

Find the `useEffect` whose body begins `// Public mode and the Overview variant take the week from the server.` and replace the entire effect with:

```tsx
  // Every variant takes its first week from the server (getNextMatchSeed), so
  // the card is in the first paint and never re-reads weeks from the browser.
  useEffect(() => {
    if (initialScheduledWeek) {
      setScheduledWeek(initialScheduledWeek)
      setCardState(initialScheduledWeek.status === 'cancelled' ? 'cancelled' : 'lineup')
    } else {
      setCardState('idle')
    }
  }, [initialScheduledWeek])
```

- [ ] **Step 2: Remove what the read needed**

Delete the `createClient` import only if the file no longer calls it anywhere else. It still does (save, cancel, reactivate) until PR 10, so leave the import for now. Remove the `Strength` and `Mentality` type imports if they were only used by the deleted mapping; run `npx tsc --noEmit` to find out.

Update the two prop comments:

```tsx
  /** Signed-out viewer: read-only card, no admin controls. */
  publicMode?: boolean
  /** The week the card starts from, computed on the server with getNextMatchSeed. */
  initialScheduledWeek?: ScheduledWeek | null
```

- [ ] **Step 3: Check whether `'loading'` is still a reachable state**

Run: `grep -n "'loading'" components/NextMatchCard.tsx`
If the only remaining references are the `CardState` union and the initial `useState<CardState>('loading')`, change the initial state to be derived so the first client render matches the server:

```tsx
  const [cardState, setCardState] = useState<CardState>(() =>
    initialScheduledWeek
      ? initialScheduledWeek.status === 'cancelled' ? 'cancelled' : 'lineup'
      : 'idle'
  )
```

and remove `'loading'` from the union and the `if (cardState === 'loading')` skeleton branch.

- [ ] **Step 4: Run the card's tests**

Run: `npm test -- __tests__/next-match-card __tests__/upcoming-card-face-off.test.tsx __tests__/match-card-kickoff.test.tsx __tests__/loading-states.test.tsx components/__tests__/NextMatchCard.unevenTeams.test.tsx`
Expected: PASS. Any test that set up a `from('weeks')` chain on the mocked client to feed the read now has a dead mock; delete that setup and pass `initialScheduledWeek` instead.

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`, sign in as an admin, open `/craft-football/results`. Expected: the next match card is present in the first paint with no skeleton, and the Network tab shows no request to `rest/v1/weeks` from the page.

- [ ] **Step 6: Commit and open the PR**

```bash
git add components/NextMatchCard.tsx __tests__
git commit -m "Take the next match card's week from the server on every tab"
git push -u origin refactor/pr-5-next-match-seed
gh pr create --base main --title "Next match card takes the server seed on every tab" --body "$(cat <<'EOF'
Release 2 of the efficiency refactor.

The Results page now seeds the card with `getNextMatchSeed`, the same helper Overview uses, and the card no longer re-reads weeks from the browser on mount. One fewer Supabase request per Results view, no skeleton before the card.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Release 3 (0.6.0): Settings pages rendered on the server

## PR 6: League settings as a server page

Branch: `refactor/pr-6-league-settings-server`

The league settings page is a 453-line client component. After hydration it lists every league the viewer belongs to just to find this one, then fetches details, members, roster, join requests, claims and two invite links in a waterfall, while the proxy has already spent four queries proving the viewer is an admin. The page becomes a server component that gathers everything in one `Promise.all` and hands it to a client shell that keeps the tabs, invite-link creation and mutation callbacks.

### Task 13: Add the fetchers the page needs

**Files:**
- Modify: `lib/fetchers.ts`
- Modify: `lib/__tests__/fetchers.test.ts`

- [ ] **Step 1: Write the failing tests** (append; extend the import to include `getLeagueMembers`, `getRosterPlayers`, `getAllPlayerClaims`)

```ts
describe('admin settings fetchers', () => {
  it('getLeagueMembers returns the RPC rows and [] on error', async () => {
    const { rpc } = mockAuth(USER)
    rpc.mockResolvedValueOnce({ data: [{ user_id: 'u2', email: 'b@b.c', display_name: 'B', role: 'member', joined_at: 'x', linked_player_name: null }], error: null })
    await expect(getLeagueMembers(LEAGUE)).resolves.toHaveLength(1)
    expect(rpc).toHaveBeenCalledWith('get_league_members', { p_game_id: LEAGUE })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Access denied' } })
    await expect(getLeagueMembers('other')).resolves.toEqual([])
  })

  it('getAllPlayerClaims returns every claim row', async () => {
    const { rpc } = mockAuth(USER)
    rpc.mockResolvedValueOnce({ data: [{ id: 'c1', status: 'pending' }, { id: 'c2', status: 'approved' }], error: null })
    await expect(getAllPlayerClaims(LEAGUE)).resolves.toHaveLength(2)
  })

  it('getRosterPlayers joins attributes with linked members and played counts', async () => {
    const { rpc } = mockAuth(USER)
    rpc.mockResolvedValueOnce({ data: [{ user_id: 'u2', email: 'b@b.c', display_name: 'Bea', role: 'member', joined_at: 'x', linked_player_name: 'Bea Smith' }], error: null })
    const attributes = {
      select: jest.fn(() => attributes),
      eq: jest.fn(() => attributes),
      order: jest.fn().mockResolvedValue({ data: [{ name: 'Bea Smith', rating: 70, mentality: 'balanced' }, { name: 'New Kid', rating: 0, mentality: 'attacking' }], error: null }),
    }
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => attributes),
      rpc: jest.fn().mockResolvedValue({ data: [{ name: 'Bea Smith', played: 12 }], error: null }),
    })
    await expect(getRosterPlayers(LEAGUE)).resolves.toEqual([
      { name: 'Bea Smith', strength: 'above', mentality: 'balanced', played: 12, linked_user_id: 'u2', linked_display_name: 'Bea' },
      { name: 'New Kid', strength: null, mentality: 'attacking', played: 0, linked_user_id: null, linked_display_name: null },
    ])
  })
})
```

Check what `ratingToStrength(70)` returns in `lib/strength.ts` before running; if 70 maps to `'average'`, change the expected value accordingly.

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- lib/__tests__/fetchers.test.ts`
Expected: FAIL on the three new tests.

- [ ] **Step 3: Implement** (append to `lib/fetchers.ts`; add `LeagueMember`, `PlayerAttribute`, `PlayerClaim` to the type import)

```ts
// ── Admin settings reads ──────────────────────────────────────────────────────
// All three are admin-only. get_league_members and get_player_claims deny
// non-admins themselves; getRosterPlayers uses the service client, so the
// page must have checked the role first (it redirects non-admins).

export const getLeagueMembers = cache(async (leagueId: string): Promise<LeagueMember[]> => {
  const authSupabase = await getAuthClient()
  const { data, error } = await authSupabase.rpc('get_league_members', { p_game_id: leagueId })
  if (error) return []
  return (data ?? []) as LeagueMember[]
})

export const getAllPlayerClaims = cache(async (leagueId: string): Promise<PlayerClaim[]> => {
  const authSupabase = await getAuthClient()
  const { data, error } = await authSupabase.rpc('get_player_claims', { p_game_id: leagueId })
  if (error) return []
  return (data ?? []) as PlayerClaim[]
})

// The roster with each player's strength, played count and linked member,
// as the Settings → Players tab and the review cards show it.
export const getRosterPlayers = cache(async (leagueId: string): Promise<PlayerAttribute[]> => {
  const service = createServiceClient()
  const [attributes, members, stats] = await Promise.all([
    service.from('player_attributes').select('name, rating, mentality').eq('game_id', leagueId).order('name', { ascending: true }),
    getLeagueMembers(leagueId),
    service.rpc('get_player_stats_public', { p_game_id: leagueId }),
  ])
  const linked = new Map(
    members
      .filter((m) => m.linked_player_name)
      .map((m) => [m.linked_player_name as string, { linked_user_id: m.user_id, linked_display_name: m.display_name || m.email }])
  )
  const played = new Map(
    ((stats.data ?? []) as { name: string; played: number }[]).map((s) => [s.name, Number(s.played ?? 0)])
  )
  return ((attributes.data ?? []) as { name: string; rating: number | null; mentality: PlayerAttribute['mentality'] }[]).map((p) => ({
    name: p.name,
    strength: ratingToStrength(Number(p.rating ?? 0)),
    mentality: p.mentality,
    played: played.get(p.name) ?? 0,
    ...(linked.get(p.name) ?? { linked_user_id: null, linked_display_name: null }),
  }))
})
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- lib/__tests__/fetchers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/fetchers.ts lib/__tests__/fetchers.test.ts
git commit -m "Add the admin settings fetchers"
```

### Task 14: Replace the client page with a server page and a client shell

**Files:**
- Create: `components/LeagueSettings.tsx`
- Create: `app/[slug]/settings/loading.tsx`
- Rewrite: `app/[slug]/settings/page.tsx`
- Modify: `CLAUDE.md` (remove the `lib/data.ts` line from the repository structure block)
- Delete: `lib/data.ts`, `app/api/games/route.ts`

- [ ] **Step 1: Create the loading state**

```tsx
// app/[slug]/settings/loading.tsx
import { Skeleton, SkeletonCard, SKELETON_FADE_IN } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export default function LeagueSettingsLoading() {
  return (
    <main className="max-w-[624px] mx-auto px-4 sm:px-6 pt-7 pb-14" aria-busy="true">
      <Skeleton className="h-[13px] w-12" />
      <h1 className="mt-3.5 text-[26px] sm:text-[30px] leading-none font-bold tracking-[-.035em] text-[#f4f9ff]">Settings</h1>
      <div className="mt-2 flex h-[15px] items-center">
        <Skeleton className="h-2.5 w-32" />
      </div>
      <div className="mt-[22px] mb-6 h-[34px] border-b border-[#17263c]" />
      <div className={cn('flex flex-col gap-3', SKELETON_FADE_IN)}>
        <SkeletonCard rows={6} />
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Write the server page**

Replace `app/[slug]/settings/page.tsx` with:

```tsx
// app/[slug]/settings/page.tsx
export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import {
  getGameBySlug, getAuthAndRole, getPlayerStats, getLeagueMembers, getRosterPlayers,
  getPendingJoinRequests, getAllPlayerClaims, getFeatures,
} from '@/lib/fetchers'
import { LeagueSettings, type SettingsSection } from '@/components/LeagueSettings'
import { DEFAULT_FEATURES } from '@/lib/defaults'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const SECTIONS: SettingsSection[] = ['details', 'members', 'players', ...(DEFAULT_FEATURES.length > 0 ? ['features' as const] : [])]

/**
 * Admin settings for one league. The proxy requires a session; this page
 * checks the role and gathers every panel's data in one batch so the client
 * shell renders with no fetch waterfall.
 */
export default async function LeagueSettingsPage({ params, searchParams }: Props) {
  const { slug } = await params
  const game = await getGameBySlug(slug)
  if (!game) notFound()

  const { userRole } = await getAuthAndRole(game.id)
  if (userRole !== 'creator' && userRole !== 'admin') redirect(`/${slug}/results`)

  const [players, members, roster, requests, claims, features, query] = await Promise.all([
    getPlayerStats(game.id),
    getLeagueMembers(game.id),
    getRosterPlayers(game.id),
    getPendingJoinRequests(game.id),
    getAllPlayerClaims(game.id),
    getFeatures(game.id),
    searchParams,
  ])

  const tab = typeof query.tab === 'string' ? query.tab : ''
  const initialSection = (SECTIONS as string[]).includes(tab) ? (tab as SettingsSection) : 'details'

  return (
    <LeagueSettings
      leagueId={game.id}
      leagueSlug={slug}
      leagueName={game.name}
      initialSection={initialSection}
      details={{
        location: game.location ?? null,
        day: game.day ?? null,
        kickoff_time: game.kickoff_time ?? null,
        bio: game.bio ?? null,
      }}
      playerCount={players.length}
      members={members}
      roster={roster}
      requests={requests}
      claims={claims.filter((c) => c.status === 'pending')}
      features={features}
    />
  )
}
```

- [ ] **Step 3: Write the client shell**

Create `components/LeagueSettings.tsx`. The JSX for the invite-links card, the review list, the member list, the features panel and the players panel is the current page's JSX moved across; what changes is that every `loading` flag and `load*` function is gone, panels read props, and every "data changed" callback is `router.refresh()`.

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Copy, Info, RefreshCw, Settings2, UserCog, Users } from 'lucide-react'
import { AdminMemberTable } from '@/components/AdminMemberTable'
import { FeaturePanel } from '@/components/FeaturePanel'
import { LeagueDetailsForm } from '@/components/LeagueDetailsForm'
import { PlayerRosterPanel } from '@/components/PlayerRosterPanel'
import { PendingReviewList } from '@/components/PendingReviewList'
import { buildReviewItems, cn } from '@/lib/utils'
import { DEFAULT_FEATURES } from '@/lib/defaults'
import type { LeagueMember, LeagueFeature, LeagueDetails, PlayerAttribute, PendingJoinRequest, PlayerClaim } from '@/lib/types'

export type SettingsSection = 'details' | 'members' | 'features' | 'players'

// The Features tab only appears while at least one feature is behind a flag.
const HAS_FEATURE_FLAGS = DEFAULT_FEATURES.length > 0

interface Props {
  leagueId: string
  leagueSlug: string
  leagueName: string
  initialSection: SettingsSection
  details: LeagueDetails
  playerCount: number
  members: LeagueMember[]
  roster: PlayerAttribute[]
  requests: PendingJoinRequest[]
  /** Pending claims only. */
  claims: PlayerClaim[]
  features: LeagueFeature[]
}

function formatExpiry(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `Expires ${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()}`
}

/**
 * The league settings tabs. Every list is a prop from the server page; after
 * a mutation the panels call router.refresh(), which re-runs the page's
 * fetchers and re-renders this component with fresh props.
 */
export function LeagueSettings({
  leagueId,
  leagueSlug,
  leagueName: initialLeagueName,
  initialSection,
  details,
  playerCount,
  members,
  roster,
  requests,
  claims,
  features,
}: Props) {
  const router = useRouter()
  const [section, setSection] = useState<SettingsSection>(initialSection)
  const [leagueName, setLeagueName] = useState(initialLeagueName)

  // Invite links are created, not read, so they stay client-side.
  const [memberLink, setMemberLink] = useState<string | null>(null)
  const [adminLink, setAdminLink] = useState<string | null>(null)
  const [memberExpiry, setMemberExpiry] = useState<string | null>(null)
  const [adminExpiry, setAdminExpiry] = useState<string | null>(null)
  const [loadingRole, setLoadingRole] = useState<'member' | 'admin' | null>(null)
  const [copiedRole, setCopiedRole] = useState<'member' | 'admin' | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)

  async function fetchInviteLink(role: 'member' | 'admin') {
    setLoadingRole(role)
    setInviteError(null)
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: leagueId, role }),
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create invite')
      if (role === 'member') {
        setMemberLink(data.link)
        setMemberExpiry(data.expiresAt ?? null)
      } else {
        setAdminLink(data.link)
        setAdminExpiry(data.expiresAt ?? null)
      }
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoadingRole(null)
    }
  }

  async function copyLink(link: string, role: 'member' | 'admin') {
    await navigator.clipboard.writeText(link)
    setCopiedRole(role)
    setTimeout(() => setCopiedRole(null), 2000)
  }

  // Both invite links are created when the Members tab is first shown.
  useEffect(() => {
    if (section !== 'members' || memberLink || adminLink) return
    fetchInviteLink('member')
    fetchInviteLink('admin')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section])

  const refresh = () => router.refresh()

  const pendingCount = buildReviewItems(requests, claims).length

  const NAV: { id: SettingsSection; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'details',  label: 'League Details', Icon: Info },
    { id: 'members',  label: 'Members',        Icon: Users },
    { id: 'players',  label: 'Players',        Icon: UserCog },
    ...(HAS_FEATURE_FLAGS ? [{ id: 'features' as const, label: 'Features', Icon: Settings2 }] : []),
  ]

  return (
    <main className="max-w-[624px] mx-auto px-4 sm:px-6 pt-7 pb-14">
      <div>
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-[7px] font-plex text-[9.5px] font-bold uppercase tracking-[.16em] text-[#8ba4c4] hover:text-[#f4f9ff] transition-colors"
        >
          <ArrowLeft className="size-[13px]" strokeWidth={2.2} />
          Back
        </button>
        <h1 className="mt-3.5 text-[26px] sm:text-[30px] leading-none font-bold tracking-[-.035em] text-[#f4f9ff]">Settings</h1>
        <p className="mt-2 font-plex text-[10px] uppercase tracking-[.14em] text-[#6f88a8]">{leagueName}</p>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 mt-[22px] mb-6 overflow-x-auto border-b border-[#17263c] -mx-4 px-4 sm:mx-0 sm:px-0 touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={(e) => {
              setSection(id)
              router.replace(`?tab=${id}`)
              e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
            }}
            className={cn(
              'flex shrink-0 items-center gap-2 px-3 pb-[11px] font-plex text-[10.5px] font-bold uppercase tracking-[.14em] whitespace-nowrap transition-colors border-b-2 -mb-px',
              section === id
                ? 'border-[#38bdf8] text-[#f4f9ff]'
                : 'border-transparent text-[#8ba4c4] hover:text-[#f4f9ff]'
            )}
          >
            <Icon className="size-[13px]" />
            {label}
            {id === 'members' && pendingCount > 0 && (
              <span
                aria-label={`${pendingCount} pending`}
                className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e2686f] px-1 text-[9px] leading-none tracking-normal text-[#05101d]"
              >
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {section === 'details' && (
        <LeagueDetailsForm
          leagueId={leagueId}
          leagueSlug={leagueSlug}
          initialDetails={details}
          playerCount={playerCount}
          leagueName={leagueName}
          onNameSaved={setLeagueName}
        />
      )}

      {section === 'members' && (
        <div className="space-y-6">
          {/* Invite Links card: moved verbatim from the old page, lines 347 to 392 */}
          <div className="rounded-xl bg-[#0a1421] border border-[#1b2c46] overflow-hidden shadow-[0_18px_44px_rgba(0,0,0,.42)]">
            <div className="px-[18px] py-3 bg-[#0c1728] border-b border-[#1b2c46]">
              <p className="font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#8ba4c4]">Invite Links</p>
            </div>
            <div className="divide-y divide-[#17263c]">
              {inviteError && (
                <div className="px-[18px] py-2 font-inter-body text-xs text-[#e2686f]">{inviteError}</div>
              )}
              {(
                [
                  { role: 'member', label: 'Member link', sub: 'Joins as member', link: memberLink, expiry: memberExpiry },
                  { role: 'admin',  label: 'Admin link',  sub: 'Joins as admin',  link: adminLink,  expiry: adminExpiry },
                ] as const
              ).map(({ role, label, sub, link, expiry }) => (
                <div key={role} className="flex flex-wrap items-center justify-between gap-x-3.5 gap-y-2 px-[18px] py-[13px]">
                  <div className="min-w-0">
                    <p className="font-inter-body text-[13px] font-semibold text-[#f4f9ff]">{label}</p>
                    <p className="mt-[3px] font-plex text-[9px] uppercase tracking-[.12em] text-[#6f88a8]">
                      {sub}
                      {expiry && <span> · {formatExpiry(expiry)}</span>}
                      {!link && !expiry && loadingRole === role && <span> · Generating…</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => link && copyLink(link, role)}
                      disabled={!link || loadingRole === role}
                      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded border border-[#38bdf8]/40 bg-[#38bdf8]/10 font-plex text-[9.5px] font-bold uppercase tracking-[.12em] text-[#7dd3fc] hover:bg-[#38bdf8]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {copiedRole === role ? <Check className="size-3" /> : <Copy className="size-3" />}
                      {copiedRole === role ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      onClick={() => fetchInviteLink(role)}
                      disabled={loadingRole === role}
                      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded border border-[#223a5c] font-plex text-[9.5px] font-bold uppercase tracking-[.12em] text-[#8ba4c4] hover:border-[#38bdf8] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <RefreshCw className={cn('size-3', loadingRole === role && 'animate-spin')} />
                      Regenerate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <PendingReviewList
            leagueId={leagueId}
            requests={requests}
            claims={claims}
            roster={roster}
            onChanged={refresh}
            onRosterStale={refresh}
          />

          <div>
            <p className="font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8] mb-3">League Members</p>
            <AdminMemberTable leagueId={leagueId} members={members} onChanged={refresh} />
          </div>
        </div>
      )}

      {section === 'features' && (
        <FeaturePanel leagueId={leagueId} features={features} onChanged={refresh} />
      )}

      {section === 'players' && (
        <PlayerRosterPanel leagueId={leagueId} initialPlayers={roster} />
      )}
    </main>
  )
}
```

- [ ] **Step 4: Delete the last of the client data path**

```bash
git rm lib/data.ts app/api/games/route.ts
```

Run: `grep -rn "lib/data'\|/api/games" app components lib --include='*.ts' --include='*.tsx' | grep -v __tests__`
Expected: no output.

Also delete the `lib/data.ts` line from the repository structure block in CLAUDE.md, since the file no longer exists.

- [ ] **Step 5: Type-check and test**

Run: `npx tsc --noEmit && npm test -- --silent 2>&1 | tail -5`
Expected: clean, only the two pre-existing failures. If `components/__tests__/PendingReviewList.test.tsx` or `PlayerRosterPanel.delete.test.tsx` imported the page, point them at `LeagueSettings` instead.

- [ ] **Step 6: Verify in the browser**

Run: `npm run dev`. Signed in as an admin, open `/craft-football/settings?tab=members`. Expected: the Members tab is already selected on first paint, the member list and review cards are present without skeletons, the two invite links generate, and the Network tab shows only the two `/api/invites` POSTs after load. Approve or decline a request in the review list; the list and the Members badge update after the refresh. Signed in as a member, the same URL lands on `/craft-football/results`.

- [ ] **Step 7: Commit and open the PR**

```bash
git add -A 'app/[slug]/settings' components/LeagueSettings.tsx lib app/api
git commit -m "Render league settings on the server"
git push -u origin refactor/pr-6-league-settings-server
gh pr create --base main --title "Render league settings on the server" --body "$(cat <<'EOF'
Release 3 of the efficiency refactor.

The league settings page is now a server component that checks the role and gathers members, roster, join requests, claims and features in one batch. The client shell (`components/LeagueSettings.tsx`) keeps the tabs, invite links and mutation callbacks, and refreshes through `router.refresh()`. The seven-request client waterfall is gone, along with `lib/data.ts` and `/api/games`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## PR 7: Account settings as a server page

Branch: `refactor/pr-7-account-settings-server`

### Task 15: Server page plus client form

**Files:**
- Modify: `lib/fetchers.ts`
- Create: `components/AccountSettings.tsx`
- Create: `app/settings/loading.tsx`
- Rewrite: `app/settings/page.tsx`

- [ ] **Step 1: Add the fetcher** (append to `lib/fetchers.ts`)

```ts
// ── Account page ──────────────────────────────────────────────────────────────

export interface AccountData {
  email: string
  firstName: string
  lastName: string
  createdAt: string | null
  leagues: { id: string; name: string }[]
  /** Keyed by league id. */
  claims: Record<string, PlayerClaim>
}

// Everything the account page shows, in one batch.
export const getAccountData = cache(async (): Promise<AccountData | null> => {
  const user = await getUser()
  if (!user) return null
  const service = createServiceClient()
  const [{ data: profile }, { data: memberships }, { data: claims }] = await Promise.all([
    service.from('profiles').select('first_name, last_name, created_at').eq('id', user.id).maybeSingle(),
    service.from('game_members').select('games(id, name)').eq('user_id', user.id),
    service.from('player_claims').select('*').eq('user_id', user.id),
  ])
  return {
    email: user.email ?? '',
    firstName: profile?.first_name ?? '',
    lastName: profile?.last_name ?? '',
    createdAt: profile?.created_at ?? null,
    leagues: ((memberships ?? []) as { games: { id: string; name: string } | null }[])
      .filter((m) => m.games?.id)
      .map((m) => ({ id: m.games!.id, name: m.games!.name })),
    claims: Object.fromEntries(((claims ?? []) as PlayerClaim[]).map((c) => [c.game_id, c])),
  }
})
```

- [ ] **Step 2: Add a test** (append to `lib/__tests__/fetchers.test.ts`; import `getAccountData`)

```ts
describe('getAccountData', () => {
  it('returns null when signed out', async () => {
    mockAuth(null)
    await expect(getAccountData()).resolves.toBeNull()
  })

  it('keys claims by league id', async () => {
    mockAuth(USER)
    const profile = queryReturning({ first_name: 'Ada', last_name: 'L', created_at: '2026-01-01' })
    const list = (data: unknown) => ({ select: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ data, error: null }) })
    const memberships = list([{ games: { id: 'g1', name: 'Boot Room' } }])
    const claims = list([{ id: 'c1', game_id: 'g1', status: 'pending', player_name: 'Ada' }])
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => (table === 'profiles' ? profile : table === 'game_members' ? memberships : claims)),
    })
    await expect(getAccountData()).resolves.toMatchObject({
      email: 'a@b.c',
      leagues: [{ id: 'g1', name: 'Boot Room' }],
      claims: { g1: { id: 'c1' } },
    })
  })
})
```

Run: `npm test -- lib/__tests__/fetchers.test.ts`
Expected: PASS.

- [ ] **Step 3: Create the loading state**

```tsx
// app/settings/loading.tsx
import { SkeletonCard, SKELETON_FADE_IN } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export default function AccountSettingsLoading() {
  return (
    <main className="max-w-xl mx-auto px-4 sm:px-6 py-8" aria-busy="true">
      <div className="mb-6">
        <div className="h-5 w-12 mb-3" />
        <h1 className="text-xl font-semibold text-[#f4f9ff]">Account</h1>
      </div>
      <div className={cn('flex flex-col gap-4', SKELETON_FADE_IN)}>
        <SkeletonCard rows={2} />
        <SkeletonCard rows={3} />
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Write the server page**

Replace `app/settings/page.tsx` with:

```tsx
// app/settings/page.tsx
export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getAccountData } from '@/lib/fetchers'
import { AccountSettings } from '@/components/AccountSettings'

export default async function AccountSettingsPage() {
  const account = await getAccountData()
  if (!account) redirect('/sign-in?redirect=/settings')
  return <AccountSettings account={account} />
}
```

- [ ] **Step 5: Create the client component**

Create `components/AccountSettings.tsx`. The JSX from the old page's second `return` (the one after `if (loading) return (...)`) moves across unchanged. The parts that differ are below; the old `load()` effect, the `loading` state and both `createClient` uses are gone.

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import PlayerClaimPicker from '@/components/PlayerClaimPicker'
import type { AccountData } from '@/lib/fetchers'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()}`
}

function AccountHeader({ onBack }: { onBack: () => void }) {
  return (
    <div className="mb-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-[#8ba4c4] hover:text-[#dff1ff] transition-colors mb-3"
      >
        <ArrowLeft className="size-4" />
        Back
      </button>
      <h1 className="text-xl font-semibold text-[#f4f9ff]">Account</h1>
    </div>
  )
}

/**
 * The account page body. Profile fields are local state so typing is
 * immediate; leagues and claims come straight from the server and refresh
 * through router.refresh() after a claim is made or cancelled.
 */
export function AccountSettings({ account }: { account: AccountData }) {
  const router = useRouter()
  const { email, createdAt, leagues, claims } = account

  const [firstName, setFirstName] = useState(account.firstName)
  const [lastName, setLastName] = useState(account.lastName)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [expandedLeague, setExpandedLeague] = useState<string | null>(null)
  const [dismissedRejected, setDismissedRejected] = useState<Set<string>>(new Set())
  const [claimSubmitting, setClaimSubmitting] = useState<string | null>(null)
  const [claimErrors, setClaimErrors] = useState<Record<string, string>>({})
  const [cancellingLeague, setCancellingLeague] = useState<string | null>(null)

  // saveProfile and handleDeleteAccount: unchanged from the old page.

  async function handleClaim(leagueId: string, playerName: string) {
    setClaimSubmitting(leagueId)
    setClaimErrors((prev) => ({ ...prev, [leagueId]: '' }))
    try {
      const res = await fetch(`/api/league/${leagueId}/player-claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: playerName }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to submit claim')
      }
      setExpandedLeague(null)
      // The server page re-reads the claim row, which the Cancel button needs.
      router.refresh()
    } catch (err) {
      setClaimErrors((prev) => ({
        ...prev,
        [leagueId]: err instanceof Error ? err.message : 'Failed to submit',
      }))
    } finally {
      setClaimSubmitting(null)
    }
  }

  async function handleCancelClaim(leagueId: string) {
    const claim = claims[leagueId]
    if (!claim?.id) return
    setCancellingLeague(leagueId)
    try {
      const res = await fetch(`/api/league/${leagueId}/player-claims/${claim.id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) throw new Error('Failed to cancel claim')
      router.refresh()
    } catch {
      // Cancellation errors are non-critical; the user can retry.
    } finally {
      setCancellingLeague(null)
    }
  }

  return (
    <main className="max-w-xl mx-auto px-4 sm:px-6 py-8">
      <AccountHeader onBack={() => router.back()} />
      {/* Account info card, profile card, linked leagues and danger zone:
          moved verbatim from the old page's main return block. */}
    </main>
  )
}
```

Copy `saveProfile` and `handleDeleteAccount` across unchanged, and paste the old return block's children in place of the comment. Nothing in that JSX referenced `loading` or the Supabase client.

- [ ] **Step 6: Type-check, test, verify**

Run: `npx tsc --noEmit && npm test -- --silent 2>&1 | tail -5`
Expected: clean.

Run: `npm run dev`, open `/settings` signed in. Expected: the page renders with the profile populated on first paint and no loading skeleton after hydration; claiming a player in a league shows "Pending" after the refresh; cancelling returns to "No player profile linked".

- [ ] **Step 7: Commit and open the PR**

```bash
git add app/settings components/AccountSettings.tsx lib/fetchers.ts lib/__tests__/fetchers.test.ts
git commit -m "Render the account page on the server"
git push -u origin refactor/pr-7-account-settings-server
gh pr create --base main --title "Render the account page on the server" --body "$(cat <<'EOF'
Release 3 of the efficiency refactor.

The account page gathers profile, leagues and claims in one server batch (`getAccountData`) and hands them to a client form. The browser no longer loads the Supabase SDK or runs four queries after hydration on this page.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Release 4 (0.7.0): The auth path

## PR 8: Verify sessions locally with JWT claims

Branch: `refactor/pr-8-get-claims`

`supabase.auth.getUser()` round-trips to Supabase Auth to validate the session. `getClaims()` verifies the access token locally against the project's public signing key, which it fetches once and caches, and only falls back to the network when the project still signs tokens with a symmetric secret. Because of that fallback the code change is safe to ship before the dashboard change; the saving arrives when the key is switched.

### Task 16: One session reader for server code

**Files:**
- Create: `lib/supabase/session.ts`
- Create: `lib/__tests__/helpers/supabase-auth.ts`
- Modify: `lib/fetchers.ts`, `lib/apiAuth.ts`, `proxy.ts`
- Modify: every test that mocks `auth.getUser`

- [ ] **Step 1: Create the reader**

```ts
// lib/supabase/session.ts
import type { SupabaseClient } from '@supabase/supabase-js'

/** The two session facts server code needs. */
export interface SessionUser {
  id: string
  email: string | null
}

/**
 * The signed-in user from the request's access token. getClaims verifies the
 * JWT locally against the project's cached public signing key, so this costs
 * no network call once asymmetric keys are enabled in the Supabase dashboard
 * (Project Settings → JWT Keys). With a symmetric secret it behaves like
 * getUser and calls the Auth server.
 */
export async function getSessionUser(supabase: Pick<SupabaseClient, 'auth'>): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (error || !claims?.sub) return null
  return { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : null }
}
```

- [ ] **Step 2: Create the shared test helper**

```ts
// lib/__tests__/helpers/supabase-auth.ts
// A mocked `auth` namespace matching lib/supabase/session.ts, for route and
// fetcher tests. Pass null for a signed-out caller.
export function mockAuthNamespace(user: { id: string; email?: string } | null) {
  return {
    getClaims: jest.fn().mockResolvedValue(
      user
        ? { data: { claims: { sub: user.id, email: user.email ?? null } }, error: null }
        : { data: null, error: { message: 'Auth session missing!' } }
    ),
    getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }),
  }
}
```

Keeping `getUser` on the mock means tests that still exercise the old path during the migration do not break.

- [ ] **Step 3: Switch `lib/fetchers.ts`**

Replace the `getUser` fetcher with:

```ts
// One session check per request. Every fetcher that needs the current user
// goes through here. Verified locally from the JWT; see lib/supabase/session.ts.
export const getUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const authSupabase = await getAuthClient()
    return await getSessionUser(authSupabase)
  } catch {
    return null
  }
})
```

Add `import { getSessionUser, type SessionUser } from '@/lib/supabase/session'`. In `getAuthAndRole`, the `user` field is now `SessionUser | null`; no caller reads anything but `id` and `email`.

- [ ] **Step 4: Switch `lib/apiAuth.ts`**

```ts
export async function requireUser(): Promise<Gate> {
  const supabase = await createClient()
  const user = await getSessionUser(supabase)
  if (!user) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  return { user }
}
```

and change `ApiUser` to `export type ApiUser = SessionUser` with the import.

- [ ] **Step 5: Switch `proxy.ts`**

Replace `const { data: { user } } = await supabase.auth.getUser()` with:

```ts
  const user = await getSessionUser(supabase)
```

and add `import { getSessionUser } from '@/lib/supabase/session'`.

- [ ] **Step 6: Update the tests**

Run: `grep -rln "getUser: jest.fn" __tests__ lib/__tests__ components/__tests__`

In each listed file, replace the hand-built `auth: { getUser: jest.fn()... }` object with `auth: mockAuthNamespace(user)` and import the helper with `import { mockAuthNamespace } from '@/lib/__tests__/helpers/supabase-auth'`. In `lib/__tests__/fetchers.test.ts` the `mockAuth` helper becomes:

```ts
function mockAuth(user: typeof USER | null) {
  const auth = mockAuthNamespace(user)
  const rpc = jest.fn()
  ;(createClient as jest.Mock).mockResolvedValue({ auth, rpc })
  return { getUserMock: auth.getClaims, rpc }
}
```

Run: `npm test -- --silent 2>&1 | tail -5`
Expected: only the two pre-existing failures.

- [ ] **Step 7: Commit and open the PR**

```bash
git add lib/supabase/session.ts lib/__tests__/helpers/supabase-auth.ts lib/fetchers.ts lib/apiAuth.ts proxy.ts __tests__ lib/__tests__ components/__tests__
git commit -m "Verify sessions from JWT claims instead of the Auth server"
git push -u origin refactor/pr-8-get-claims
gh pr create --base main --title "Verify sessions from JWT claims" --body "$(cat <<'EOF'
Release 4 of the efficiency refactor.

Every server-side session check (fetchers, API gates, proxy) now goes through `getSessionUser`, which uses `auth.getClaims()`. With asymmetric signing keys enabled this verifies the token locally and removes one Auth server round trip from every render and API call. Until the key is switched it falls back to the network, so there is no behaviour change on merge.

Ops step after merge (see Task 17): enable asymmetric JWT signing keys in the Supabase dashboard.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Task 17: Switch the project to asymmetric signing keys (ops, after PR 8 deploys)

- [ ] **Step 1:** In the Supabase dashboard open Project Settings → JWT Keys. If the project shows a legacy HS256 secret, choose "Migrate to new signing keys", create an ES256 (or RS256) key, and make it current. Leave the legacy secret in the "previously used" state so sessions issued before the switch keep working until they refresh.
- [ ] **Step 2:** Sign out and in on production, open a league page, then check Supabase → Logs → Auth. Expected: no `GET /auth/v1/user` entries for your page views, only token refreshes.
- [ ] **Step 3:** Record the date of the switch in `docs/superpowers/plans/2026-10-20-efficiency-refactor.md` under this task.

## PR 9: A slimmer proxy

Branch: `refactor/pr-9-proxy`

For `/[slug]/settings` the proxy currently resolves the user, checks the profile, looks up the league by slug and reads the member's role: four sequential queries before the page runs the same checks again. After PR 6 the page redirects non-admins itself, so the proxy only needs to know a session exists.

### Task 18: Rewrite `proxy.ts`

**Files:**
- Rewrite: `proxy.ts`
- Modify: `CLAUDE.md` (one bullet)

- [ ] **Step 1: Replace the file**

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/supabase/session'

const SIGN_IN_PATH = '/sign-in'

function getSupabaseUrl() { return process.env.NEXT_PUBLIC_SUPABASE_URL! }
function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
}

/**
 * Two routes need a session before they render: the account page, which
 * also needs a profiles row, and a league's settings page, whose server
 * component checks the admin role itself and redirects members. Everything
 * else is public. The session is verified locally from the JWT.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Forward pathname to server components via request header
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)
  const requestWithPathname = { request: { headers: requestHeaders } }

  if (pathname.startsWith('/api') || pathname.startsWith('/auth') || pathname.startsWith('/_next')) {
    return NextResponse.next(requestWithPathname)
  }

  // Fix Supabase magic link: /?code= → /auth/callback?code=
  const code = request.nextUrl.searchParams.get('code')
  if (code && (pathname === '/' || pathname === '')) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/callback'
    return NextResponse.redirect(url)
  }

  const isAccountSettings = pathname === '/settings' || pathname.startsWith('/settings/')
  const isLeagueSettings = /^\/[^/]+\/settings(\/|$)/.test(pathname)
  if (!isAccountSettings && !isLeagueSettings) {
    return NextResponse.next(requestWithPathname)
  }

  const response = NextResponse.next(requestWithPathname)
  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  const user = await getSessionUser(supabase)
  if (!user) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = SIGN_IN_PATH
    redirectUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Both guarded routes need a profiles row. Accepting an invite or creating
  // a league does not create one, so a profile-less admin would otherwise
  // reach league settings.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/profile-required'
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 2: Update the CLAUDE.md bullet written in Task 4**

Change the second bullet of "Auth and access model" to:

```
- Both require a Supabase session with a `profiles` row (checked in the proxy); `/[slug]/settings` also requires a creator or admin role (checked by the page, which redirects members to the league's results)
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`. Then `npm run dev` and check, signed out: `/settings` and `/craft-football/settings` both redirect to `/sign-in?redirect=...`. Signed in as a member: `/craft-football/settings` lands on `/craft-football/results`. Signed in as an admin: the settings page renders.

- [ ] **Step 4: Commit and open the PR**

```bash
git add proxy.ts CLAUDE.md
git commit -m "Let the settings page own its admin check"
git push -u origin refactor/pr-9-proxy
gh pr create --base main --title "Slimmer proxy for league settings" --body "$(cat <<'EOF'
Release 4 of the efficiency refactor.

The proxy now only confirms a session with a `profiles` row for `/[slug]/settings`; the server page (PR 6) checks the role and redirects members. That removes two of the three sequential queries (league by slug, member role) from every settings visit; the profiles check stays because accepting an invite or creating a league does not create a profiles row.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Release 5 (0.8.0): Writes through the API, and a league cache

## PR 10: Line-up and result writes go through API routes

Branch: `refactor/pr-10-write-routes`

`NextMatchCard` and `ResultModal` call six Supabase RPCs straight from the browser (`save_lineup`, `cancel_lineup`, `cancel_week`, `record_result`, `name_guests`, `promote_roster`). That keeps the Supabase SDK in the Results and Overview bundles, and it means the server never sees a write, which PR 11 needs. Four routes replace them. The RPCs already enforce the admin role with `auth.uid()`, so the routes call them through the cookie-backed client after `requireLeagueAdmin`.

### Task 19: Request types and the client helper

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/leagueApi.ts`
- Create: `lib/__tests__/leagueApi.test.ts`

- [ ] **Step 1: Add the request types** (append to `lib/types.ts`)

```ts
// ── Write requests from the match cards to /api/league/[id]/... ──────────────

export interface SaveLineupInput {
  season: string
  week: number
  date: string
  format: string | null
  teamA: string[]
  teamB: string[]
  /** The DB shape (snake_case keys) the card already builds for save_lineup. */
  lineupMetadata: Record<string, unknown> | null
  teamARating: number | null
  teamBRating: number | null
}

export interface CancelWeekInput {
  season: string
  week: number
  date: string
}

export interface RecordResultInput {
  dnf: boolean
  winner: Winner | null
  notes: string | null
  goalDifference: number | null
  teamARating: number | null
  teamBRating: number | null
  /** Guests promoted to the roster under a new name. */
  guests: { oldName: string; newName: string; rating: number; goalkeeper: boolean }[]
  /** Reviewed new players to add to the roster. */
  newPlayers: { name: string; rating: number; mentality: Mentality; goalkeeper: boolean }[]
}
```

- [ ] **Step 2: Write the failing helper test**

```ts
// lib/__tests__/leagueApi.test.ts
import { saveLineup, cancelLineup, cancelWeek, recordResult } from '@/lib/leagueApi'

const fetchMock = jest.fn()
beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

function ok(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
}

describe('leagueApi', () => {
  it('saveLineup posts the input and returns the week id', async () => {
    fetchMock.mockReturnValue(ok({ weekId: 'w1' }))
    const input = { season: '2026', week: 3, date: '22 Oct 2026', format: null, teamA: ['A'], teamB: ['B'], lineupMetadata: null, teamARating: null, teamBRating: null }
    await expect(saveLineup('g1', input)).resolves.toEqual({ weekId: 'w1' })
    expect(fetchMock).toHaveBeenCalledWith('/api/league/g1/lineup', expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }))
  })

  it('cancelLineup deletes the week', async () => {
    fetchMock.mockReturnValue(ok({ ok: true }))
    await cancelLineup('g1', 'w1')
    expect(fetchMock).toHaveBeenCalledWith('/api/league/g1/lineup/w1', expect.objectContaining({ method: 'DELETE' }))
  })

  it('cancelWeek returns the week id', async () => {
    fetchMock.mockReturnValue(ok({ weekId: 'w2' }))
    await expect(cancelWeek('g1', { season: '2026', week: 4, date: '29 Oct 2026' })).resolves.toEqual({ weekId: 'w2' })
  })

  it('recordResult throws the server error message', async () => {
    fetchMock.mockReturnValue(ok({ error: 'name_already_exists' }, 409))
    await expect(recordResult('g1', 'w1', { dnf: false, winner: 'teamA', notes: null, goalDifference: 1, teamARating: 50, teamBRating: 48, guests: [], newPlayers: [] }))
      .rejects.toThrow('name_already_exists')
  })
})
```

- [ ] **Step 3: Run to confirm failure**

Run: `npm test -- lib/__tests__/leagueApi.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 4: Create the helper**

```ts
// lib/leagueApi.ts
// Browser-side calls to the league write routes. Each throws an Error whose
// message is the route's `error` field, so callers can show it as before.
import type { CancelWeekInput, RecordResultInput, SaveLineupInput } from '@/lib/types'

async function send<T>(url: string, method: 'POST' | 'DELETE', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`)
  return data as T
}

export function saveLineup(leagueId: string, input: SaveLineupInput): Promise<{ weekId: string }> {
  return send(`/api/league/${leagueId}/lineup`, 'POST', input)
}

export function cancelLineup(leagueId: string, weekId: string): Promise<void> {
  return send(`/api/league/${leagueId}/lineup/${weekId}`, 'DELETE')
}

export function cancelWeek(leagueId: string, input: CancelWeekInput): Promise<{ weekId: string }> {
  return send(`/api/league/${leagueId}/weeks/cancel`, 'POST', input)
}

export function recordResult(leagueId: string, weekId: string, input: RecordResultInput): Promise<void> {
  return send(`/api/league/${leagueId}/weeks/${weekId}/result`, 'POST', input)
}
```

- [ ] **Step 5: Run the test**

Run: `npm test -- lib/__tests__/leagueApi.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/leagueApi.ts lib/__tests__/leagueApi.test.ts
git commit -m "Add the browser helper for line-up and result writes"
```

### Task 20: The four routes, with tests

**Files:**
- Create: `app/api/league/[id]/lineup/route.ts`
- Create: `app/api/league/[id]/lineup/[weekId]/route.ts`
- Create: `app/api/league/[id]/weeks/cancel/route.ts`
- Create: `app/api/league/[id]/weeks/[weekId]/result/route.ts`
- Create: `__tests__/lineup-result-routes.test.ts`

- [ ] **Step 1: Write the failing route tests**

```ts
// __tests__/lineup-result-routes.test.ts
import { createClient } from '@/lib/supabase/server'
import { mockAuthNamespace } from '@/lib/__tests__/helpers/supabase-auth'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

import { POST as saveLineup } from '@/app/api/league/[id]/lineup/route'
import { DELETE as cancelLineup } from '@/app/api/league/[id]/lineup/[weekId]/route'
import { POST as cancelWeek } from '@/app/api/league/[id]/weeks/cancel/route'
import { POST as recordResult } from '@/app/api/league/[id]/weeks/[weekId]/result/route'

const rpc = jest.fn()

function setup({ user = true, admin = true } = {}) {
  rpc.mockImplementation(async (name: string) => {
    if (name === 'is_game_admin') return { data: admin, error: null }
    if (name === 'save_lineup' || name === 'cancel_week') return { data: 'w-new', error: null }
    return { data: null, error: null }
  })
  ;(createClient as jest.Mock).mockResolvedValue({
    auth: mockAuthNamespace(user ? { id: 'u1', email: 'a@example.com' } : null),
    rpc,
  })
}

function json(body: unknown, method = 'POST') {
  return new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const league = { params: Promise.resolve({ id: 'g1' }) }
const week = { params: Promise.resolve({ id: 'g1', weekId: 'w1' }) }

const LINEUP = { season: '2026', week: 3, date: '22 Oct 2026', format: '7-a-side', teamA: ['A'], teamB: ['B'], lineupMetadata: { guests: [], new_players: [] }, teamARating: 50, teamBRating: 49 }

beforeEach(() => rpc.mockReset())

describe('POST lineup', () => {
  it('calls save_lineup and returns the week id', async () => {
    setup()
    const res = await saveLineup(json(LINEUP), league)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ weekId: 'w-new' })
    expect(rpc).toHaveBeenCalledWith('save_lineup', {
      p_game_id: 'g1', p_season: '2026', p_week: 3, p_date: '22 Oct 2026', p_format: '7-a-side',
      p_team_a: ['A'], p_team_b: ['B'], p_lineup_metadata: { guests: [], new_players: [] },
      p_team_a_rating: 50, p_team_b_rating: 49,
    })
  })

  it('rejects non-admins', async () => {
    setup({ admin: false })
    expect((await saveLineup(json(LINEUP), league)).status).toBe(403)
  })

  it('rejects a body without teams', async () => {
    setup()
    expect((await saveLineup(json({ ...LINEUP, teamA: 'nope' }), league)).status).toBe(400)
  })
})

describe('DELETE lineup/[weekId]', () => {
  it('calls cancel_lineup', async () => {
    setup()
    const res = await cancelLineup(new Request('http://localhost/api', { method: 'DELETE' }), week)
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('cancel_lineup', { p_week_id: 'w1' })
  })
})

describe('POST weeks/cancel', () => {
  it('calls cancel_week and returns the week id', async () => {
    setup()
    const res = await cancelWeek(json({ season: '2026', week: 3, date: '22 Oct 2026' }), league)
    await expect(res.json()).resolves.toEqual({ weekId: 'w-new' })
    expect(rpc).toHaveBeenCalledWith('cancel_week', { p_game_id: 'g1', p_season: '2026', p_week: 3, p_date: '22 Oct 2026' })
  })
})

describe('POST weeks/[weekId]/result', () => {
  const RESULT = { dnf: false, winner: 'teamA', notes: 'Tight', goalDifference: 1, teamARating: 50, teamBRating: 49, guests: [], newPlayers: [] }

  it('records the result and skips roster RPCs when there is nothing to add', async () => {
    setup()
    expect((await recordResult(json(RESULT), week)).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('record_result', {
      p_week_id: 'w1', p_dnf: false, p_winner: 'teamA', p_notes: 'Tight', p_goal_difference: 1, p_team_a_rating: 50, p_team_b_rating: 49,
    })
    expect(rpc).not.toHaveBeenCalledWith('name_guests', expect.anything())
    expect(rpc).not.toHaveBeenCalledWith('promote_roster', expect.anything())
  })

  it('names guests and promotes new players after the result', async () => {
    setup()
    await recordResult(json({
      ...RESULT,
      guests: [{ oldName: 'Jaff +1', newName: 'Sam', rating: 55, goalkeeper: false }],
      newPlayers: [{ name: 'Kit', rating: 50, mentality: 'balanced', goalkeeper: false }],
    }), week)
    const names = rpc.mock.calls.map((c) => c[0])
    expect(names).toEqual(['is_game_admin', 'record_result', 'name_guests', 'promote_roster'])
    expect(rpc).toHaveBeenCalledWith('name_guests', { p_week_id: 'w1', p_guests: [{ old_name: 'Jaff +1', new_name: 'Sam', rating: 55, goalkeeper: false }] })
    expect(rpc).toHaveBeenCalledWith('promote_roster', { p_game_id: 'g1', p_entries: [{ name: 'Kit', rating: 50, mentality: 'balanced', goalkeeper: false }] })
  })

  it('maps a duplicate guest name to 409', async () => {
    setup()
    rpc.mockImplementation(async (name: string) => {
      if (name === 'is_game_admin') return { data: true, error: null }
      if (name === 'name_guests') return { data: null, error: { message: 'name_already_exists' } }
      return { data: null, error: null }
    })
    const res = await recordResult(json({ ...RESULT, guests: [{ oldName: 'G', newName: 'Dup', rating: 50, goalkeeper: false }] }), week)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'name_already_exists' })
  })

  it('rejects a played result without a winner', async () => {
    setup()
    expect((await recordResult(json({ ...RESULT, winner: null }), week)).status).toBe(400)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- __tests__/lineup-result-routes.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Create `app/api/league/[id]/lineup/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/apiAuth'
import type { SaveLineupInput } from '@/lib/types'

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')
const numberOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function parseBody(body: unknown): SaveLineupInput | null {
  const b = body as Record<string, unknown>
  if (!b || typeof b !== 'object') return null
  if (typeof b.season !== 'string' || typeof b.week !== 'number' || typeof b.date !== 'string') return null
  if (!isStringArray(b.teamA) || !isStringArray(b.teamB)) return null
  return {
    season: b.season,
    week: b.week,
    date: b.date,
    format: typeof b.format === 'string' && b.format ? b.format : null,
    teamA: b.teamA,
    teamB: b.teamB,
    lineupMetadata: b.lineupMetadata && typeof b.lineupMetadata === 'object' ? (b.lineupMetadata as Record<string, unknown>) : null,
    teamARating: numberOrNull(b.teamARating),
    teamBRating: numberOrNull(b.teamBRating),
  }
}

/** POST — admin-only. Saves (or replaces) the scheduled line-up via save_lineup. Returns { weekId }. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireLeagueAdmin(id)
  if ('response' in gate) return gate.response

  const input = parseBody(await req.json().catch(() => null))
  if (!input) return NextResponse.json({ error: 'Invalid line-up' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('save_lineup', {
    p_game_id: id,
    p_season: input.season,
    p_week: input.week,
    p_date: input.date,
    p_format: input.format,
    p_team_a: input.teamA,
    p_team_b: input.teamB,
    p_lineup_metadata: input.lineupMetadata,
    p_team_a_rating: input.teamARating,
    p_team_b_rating: input.teamBRating,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ weekId: data as string })
}
```

- [ ] **Step 4: Create `app/api/league/[id]/lineup/[weekId]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/apiAuth'

/** DELETE — admin-only. Removes a scheduled or cancelled week's line-up via cancel_lineup. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; weekId: string }> }) {
  const { id, weekId } = await params
  const gate = await requireLeagueAdmin(id)
  if ('response' in gate) return gate.response

  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_lineup', { p_week_id: weekId })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Create `app/api/league/[id]/weeks/cancel/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/apiAuth'

/** POST — admin-only. Marks a game day cancelled via cancel_week. Body: { season, week, date }. Returns { weekId }. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireLeagueAdmin(id)
  if ('response' in gate) return gate.response

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b.season !== 'string' || typeof b.week !== 'number' || typeof b.date !== 'string') {
    return NextResponse.json({ error: 'season, week and date are required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('cancel_week', {
    p_game_id: id, p_season: b.season, p_week: b.week, p_date: b.date,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ weekId: data as string })
}
```

- [ ] **Step 6: Create `app/api/league/[id]/weeks/[weekId]/result/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/apiAuth'
import type { RecordResultInput, Winner } from '@/lib/types'

const WINNERS: Winner[] = ['teamA', 'teamB', 'draw']

function parseBody(body: unknown): RecordResultInput | null {
  const b = body as Record<string, unknown>
  if (!b || typeof b !== 'object' || typeof b.dnf !== 'boolean') return null
  const winner = WINNERS.includes(b.winner as Winner) ? (b.winner as Winner) : null
  if (!b.dnf && !winner) return null
  const guests = Array.isArray(b.guests) ? b.guests : []
  const newPlayers = Array.isArray(b.newPlayers) ? b.newPlayers : []
  return {
    dnf: b.dnf,
    winner: b.dnf ? null : winner,
    notes: typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim() : null,
    goalDifference: b.dnf ? null : typeof b.goalDifference === 'number' ? b.goalDifference : null,
    teamARating: b.dnf ? null : typeof b.teamARating === 'number' ? b.teamARating : null,
    teamBRating: b.dnf ? null : typeof b.teamBRating === 'number' ? b.teamBRating : null,
    guests: guests as RecordResultInput['guests'],
    newPlayers: newPlayers as RecordResultInput['newPlayers'],
  }
}

/**
 * POST — admin-only. Records a result (or DNF) via record_result, then names
 * roster guests and promotes new players, in that order, exactly as the
 * ResultModal did from the browser. A duplicate guest name returns 409 with
 * `error: 'name_already_exists'`.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; weekId: string }> }) {
  const { id, weekId } = await params
  const gate = await requireLeagueAdmin(id)
  if ('response' in gate) return gate.response

  const input = parseBody(await req.json().catch(() => null))
  if (!input) return NextResponse.json({ error: 'Invalid result' }, { status: 400 })

  const supabase = await createClient()
  const { error: resultErr } = await supabase.rpc('record_result', {
    p_week_id: weekId,
    p_dnf: input.dnf,
    p_winner: input.winner,
    p_notes: input.notes,
    p_goal_difference: input.goalDifference,
    p_team_a_rating: input.teamARating,
    p_team_b_rating: input.teamBRating,
  })
  if (resultErr) return NextResponse.json({ error: resultErr.message }, { status: 400 })

  if (input.guests.length > 0) {
    const { error } = await supabase.rpc('name_guests', {
      p_week_id: weekId,
      p_guests: input.guests.map((g) => ({ old_name: g.oldName, new_name: g.newName, rating: g.rating, goalkeeper: g.goalkeeper })),
    })
    if (error?.message.includes('name_already_exists')) {
      return NextResponse.json({ error: 'name_already_exists' }, { status: 409 })
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (input.newPlayers.length > 0) {
    const { error } = await supabase.rpc('promote_roster', {
      p_game_id: id,
      p_entries: input.newPlayers.map((p) => ({ name: p.name, rating: p.rating, mentality: p.mentality, goalkeeper: p.goalkeeper })),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 7: Run the route tests**

Run: `npm test -- __tests__/lineup-result-routes.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 8: Commit**

```bash
git add 'app/api/league/[id]/lineup' 'app/api/league/[id]/weeks/cancel' 'app/api/league/[id]/weeks/[weekId]/result' __tests__/lineup-result-routes.test.ts
git commit -m "Add API routes for line-up and result writes"
```

### Task 21: Point the cards at the routes

**Files:**
- Modify: `components/NextMatchCard.tsx`
- Modify: `components/ResultModal.tsx`
- Modify: `__tests__/result-modal-guest-roster.test.tsx`, `__tests__/next-match-card-overview.test.tsx`, `__tests__/next-match-card-share.test.tsx`, `__tests__/upcoming-card-face-off.test.tsx`, `__tests__/match-card-kickoff.test.tsx`, `__tests__/loading-states.test.tsx`

- [ ] **Step 1: `NextMatchCard.tsx`**

Replace `import { createClient } from '@/lib/supabase/client'` with `import { saveLineup, cancelLineup, cancelWeek } from '@/lib/leagueApi'`.

In `handleSaveLineup`, replace the `const supabase = createClient()` line and the `rpc('save_lineup', {...})` call through `const weekId = data as string` with:

```ts
      const { weekId } = await saveLineup(gameId, {
        season,
        week: saveWeek,
        date: saveDate,
        format: format || null,
        teamA,
        teamB,
        lineupMetadata: lineupMetadataForDB,
        teamARating,
        teamBRating,
      })
```

In `handleCancelScheduled`, replace the two Supabase lines with `await cancelLineup(gameId, scheduledWeek.id)`.

In `handleCancelGame`, replace from `const supabase = createClient()` through `const weekId = data as string` with:

```ts
      const { weekId } = await cancelWeek(gameId, { season, week: cancelWeek, date: cancelDate })
```

(Rename the local `cancelWeek` variable to `cancelWeekNumber` first so it does not shadow the import.)

In `handleReactivate`, replace the two Supabase lines and the `if (err) throw err` with `await cancelLineup(gameId, scheduledWeek.id)`.

- [ ] **Step 2: `ResultModal.tsx`**

Replace the `createClient` import with `import { recordResult } from '@/lib/leagueApi'`. Delete `saveRosterChanges` and replace it with a builder:

```ts
  // What the result route adds to the roster after record_result.
  function rosterChanges() {
    return {
      guests: rosterGuests.map((g) => ({
        oldName: g.name,
        newName: g.rosterName.trim(),
        rating: strengthToRating(g.strength),
        goalkeeper: g.goalkeeper,
      })),
      newPlayers: newPlayerStates.map((p) => ({
        name: p.name,
        rating: strengthToRating(p.strength),
        mentality: p.mentality,
        goalkeeper: p.mentality === 'goalkeeper',
      })),
    }
  }

  // The route reports a duplicate guest name as 'name_already_exists'.
  function describeSaveError(e: unknown): string {
    if (e instanceof Error && e.message === 'name_already_exists') {
      const names = rosterGuests.map((g) => `"${g.rosterName.trim()}"`).join(' or ')
      return `A player named ${names} already exists.`
    }
    return e instanceof Error ? e.message : 'Failed to save result'
  }
```

In the DNF branch of `handleSave`, replace from `const supabase = createClient()` through `await saveRosterChanges(supabase)` with:

```ts
        await recordResult(gameId, scheduledWeek.id, {
          dnf: true, winner: null, notes: notes.trim() || null,
          goalDifference: null, teamARating: null, teamBRating: null,
          ...rosterChanges(),
        })
```

In the played branch, replace the equivalent block with:

```ts
      await recordResult(gameId, scheduledWeek.id, {
        dnf: false,
        winner,
        notes: notes.trim() || null,
        goalDifference: winner === 'draw' ? 0 : goalDifference,
        teamARating: teamAScore,
        teamBRating: teamBScore,
        ...rosterChanges(),
      })
```

Where the `catch` sets the error message, use `setError(describeSaveError(e))`.

- [ ] **Step 3: Update the six component tests**

In each file replace `jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))` and its `createClient` import with:

```ts
jest.mock('@/lib/leagueApi', () => ({
  saveLineup: jest.fn().mockResolvedValue({ weekId: 'w-new' }),
  cancelLineup: jest.fn().mockResolvedValue(undefined),
  cancelWeek: jest.fn().mockResolvedValue({ weekId: 'w-new' }),
  recordResult: jest.fn().mockResolvedValue(undefined),
}))
import { recordResult, saveLineup } from '@/lib/leagueApi'
```

Assertions that read `rpc.mock.calls` for `name_guests` or `promote_roster` become assertions on `recordResult`, for example in `result-modal-guest-roster.test.tsx`:

```ts
expect(recordResult).toHaveBeenCalledWith('g1', 'w41', expect.objectContaining({
  guests: [{ oldName: 'Jaff +1', newName: 'Sam', rating: 50, goalkeeper: false }],
}))
```

Run: `npm test -- __tests__ --silent 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 4: Confirm the SDK has left the match cards**

Run: `grep -rl "@/lib/supabase/client" components app`
Expected: exactly `components/AuthForms.tsx` and `components/InviteAccept.tsx`.

Run: `npm run build && npm run bundle-report | head -5`
Expected: the Results and Overview tabs drop by roughly the SDK's size, to about 110 kB and 100 kB.

- [ ] **Step 5: Verify in the browser**

As an admin on `/craft-football/results`: build a line-up and save, share, cancel the game, reactivate, record a result with a guest added to the roster, record a DNF. Each action completes and the page refreshes with the change. The Network tab shows calls to `/api/league/.../lineup`, `/weeks/cancel` and `/result`, and none to `rest/v1/rpc`.

- [ ] **Step 6: Commit and open the PR**

```bash
git add components/NextMatchCard.tsx components/ResultModal.tsx __tests__
git commit -m "Send line-up and result writes through the API"
git push -u origin refactor/pr-10-write-routes
gh pr create --base main --title "Line-up and result writes go through API routes" --body "$(cat <<'EOF'
Release 5 of the efficiency refactor.

Four new admin routes wrap `save_lineup`, `cancel_lineup`, `cancel_week`, and `record_result` with `name_guests` and `promote_roster`. The match cards call them through `lib/leagueApi.ts`. The Supabase browser SDK is now only loaded by the auth forms (on demand) and the invite page, and every league write passes through the server, which PR 11 relies on to invalidate the league cache.

Bundle report: (paste)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## PR 11: A tagged cache over the public league reads

Branch: `refactor/pr-11-league-cache`

Each page view runs the game lookup, the player stats RPC and the weeks query. For public visitors the answer is the same for everyone, and for members it only changes when an admin writes. `unstable_cache` from `next/cache` stores those three results across requests with a tag per league, and every write route calls `revalidateTag`. In production on Vercel this is the shared Data Cache; in `next dev` it is in-memory per process.

Two constraints shape the design:

- `revalidateTag` throws if called during render (Next error E7). `ensureUnrecordedWeek` writes during render, so it cannot invalidate. The weeks entry therefore also has a 60 second time-based revalidation, and when the RPC reports the row already exists the function re-reads weeks uncached for that request.
- `unstable_cache` tags are fixed when the cached function is created, so each fetcher creates its cached reader per call with the tag baked in. The React `cache()` wrapper stays on the outside for per-request deduplication.

### Task 22: `lib/leagueCache.ts` and the cached fetchers

**Files:**
- Create: `lib/leagueCache.ts`
- Modify: `lib/fetchers.ts`
- Modify: `lib/__tests__/fetchers.test.ts`

- [ ] **Step 1: Create the tag helpers**

```ts
// lib/leagueCache.ts
// Cross-request cache tags for a league's public reads (game row, weeks,
// player stats). Every route that writes to games, weeks or player_attributes
// calls revalidateLeague so the next render re-reads.
import { revalidateTag } from 'next/cache'

/** How long a cached league read may serve without a write, in seconds. */
export const LEAGUE_CACHE_SECONDS = 60

export const leagueTag = (leagueId: string) => `league:${leagueId}`
export const leagueSlugTag = (slug: string) => `league-slug:${slug}`

/**
 * Invalidates a league's cached reads. Pass every slug the league has had in
 * this request (old and new) when a write may have changed it; the slug
 * lookup is cached under its own tag.
 */
export function revalidateLeague(leagueId: string, slugs: string[] = []): void {
  // { expire: 0 } expires the entry so the very next render re-reads. The
  // 'max' profile would serve the stale entry once while refreshing in the
  // background, which is exactly what an admin's refresh after a save would
  // hit. updateTag is Server-Action-only, so route handlers cannot use it.
  revalidateTag(leagueTag(leagueId), { expire: 0 })
  for (const slug of slugs) revalidateTag(leagueSlugTag(slug), { expire: 0 })
}
```

- [ ] **Step 2: Mock `next/cache` in the fetchers test** (top of `lib/__tests__/fetchers.test.ts`, with the other mocks)

```ts
// unstable_cache is an identity in tests: the fetchers are exercised, the
// cross-request cache is not.
jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: jest.fn(),
}))
```

- [ ] **Step 3: Add a test for the conflict path of `ensureUnrecordedWeek`** (append)

```ts
describe('ensureUnrecordedWeek when the row already exists', () => {
  it('re-reads weeks uncached instead of returning the stale list', async () => {
    const existing: Week[] = [
      { id: 'w1', season: '2026', week: 1, date: '01 Oct 2026', status: 'played', teamA: ['A'], teamB: ['B'], winner: 'teamA' },
    ]
    const reread = { ...existing[0], id: 'w2', week: 2, date: '08 Oct 2026', status: 'unrecorded', teamA: [], teamB: [], winner: null }
    const weeksQuery = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), in: jest.fn().mockResolvedValue({ data: [
      { id: 'w1', season: '2026', week: 1, date: '01 Oct 2026', status: 'played', format: null, team_a: ['A'], team_b: ['B'], winner: 'teamA', notes: null, goal_difference: null, team_a_rating: null, team_b_rating: null, lineup_metadata: null },
      { id: 'w2', season: '2026', week: 2, date: '08 Oct 2026', status: 'unrecorded', format: null, team_a: [], team_b: [], winner: null, notes: null, goal_difference: null, team_a_rating: null, team_b_rating: null, lineup_metadata: null },
    ], error: null }) }
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => weeksQuery),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }), // ON CONFLICT DO NOTHING
    })
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 10, 12)) // Sat 10 Oct 2026, Thursday 8 Oct has passed
    const result = await ensureUnrecordedWeek(LEAGUE, existing, 4)
    jest.useRealTimers()
    expect(result.map((w) => w.id)).toEqual(['w2', 'w1'])
    expect(result.find((w) => w.id === 'w2')?.status).toBe(reread.status)
  })
})
```

If `getMostRecentExpectedGameDate` needs a different fixture date to return 08 Oct 2026, adjust the system time; the assertion that matters is that the re-read list contains `w2`.

- [ ] **Step 4: Run to confirm the new test fails**

Run: `npm test -- lib/__tests__/fetchers.test.ts`
Expected: the new test fails (result lacks `w2`); everything else passes.

- [ ] **Step 5: Wrap the four reads in `lib/fetchers.ts`**

Add the imports:

```ts
import { unstable_cache } from 'next/cache'
import { LEAGUE_CACHE_SECONDS, leagueTag, leagueSlugTag } from '@/lib/leagueCache'
```

Replace `getGame` and `getGameBySlug`:

```ts
const GAME_COLUMNS = 'id, name, slug, location, day, kickoff_time, bio'

async function readGame(leagueId: string) {
  const { data } = await createServiceClient().from('games').select(GAME_COLUMNS).eq('id', leagueId).maybeSingle()
  return data
}

async function readGameBySlug(slug: string) {
  const { data } = await createServiceClient().from('games').select(GAME_COLUMNS).eq('slug', slug).maybeSingle()
  return data
}

// Cached across requests under the league's tag (see lib/leagueCache.ts), and
// within a request by React cache().
export const getGame = cache((leagueId: string) =>
  unstable_cache(readGame, ['game', leagueId], { tags: [leagueTag(leagueId)], revalidate: LEAGUE_CACHE_SECONDS })(leagueId)
)

export const getGameBySlug = cache((slug: string) =>
  unstable_cache(readGameBySlug, ['game-by-slug', slug], { tags: [leagueSlugTag(slug)], revalidate: LEAGUE_CACHE_SECONDS })(slug)
)
```

Replace `getPlayerStats` so the existing body becomes `readPlayerStats(leagueId)` and:

```ts
export const getPlayerStats = cache((leagueId: string) =>
  unstable_cache(readPlayerStats, ['player-stats', leagueId], { tags: [leagueTag(leagueId)], revalidate: LEAGUE_CACHE_SECONDS })(leagueId)
)
```

Replace `getWeeks` so the existing body becomes:

```ts
const WEEK_COLUMNS = 'id, season, week, date, status, format, team_a, team_b, winner, notes, goal_difference, team_a_rating, team_b_rating, lineup_metadata'

// The uncached read. ensureUnrecordedWeek uses it directly when it finds the
// cache is behind a row it tried to create.
async function readWeeks(leagueId: string): Promise<Week[]> {
  const { data } = await createServiceClient()
    .from('weeks')
    .select(WEEK_COLUMNS)
    .eq('game_id', leagueId)
    .in('status', ['played', 'cancelled', 'unrecorded', 'scheduled', 'dnf'])
  return sortWeeks(((data ?? []) as WeekRow[]).map(mapWeekRow))
}

export const getWeeks = cache((leagueId: string) =>
  unstable_cache(readWeeks, ['weeks', leagueId], { tags: [leagueTag(leagueId)], revalidate: LEAGUE_CACHE_SECONDS })(leagueId)
)
```

In `ensureUnrecordedWeek`, replace `if (!newId) return weeks` with:

```ts
  // Null means ON CONFLICT DO NOTHING: another request created the row and
  // the cached list is behind it. Re-read once, uncached, for this request;
  // the cache catches up within LEAGUE_CACHE_SECONDS.
  if (!newId) return readWeeks(leagueId)
```

- [ ] **Step 6: Run the fetchers tests**

Run: `npm test -- lib/__tests__/fetchers.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/leagueCache.ts lib/fetchers.ts lib/__tests__/fetchers.test.ts
git commit -m "Cache a league's public reads across requests"
```

### Task 23: Invalidate from every write route

**Files:**
- Modify: `app/api/league/[id]/lineup/route.ts`, `app/api/league/[id]/lineup/[weekId]/route.ts`, `app/api/league/[id]/weeks/cancel/route.ts`, `app/api/league/[id]/weeks/[weekId]/result/route.ts`, `app/api/league/[id]/weeks/[weekId]/route.ts`, `app/api/league/[id]/weeks/[weekId]/edit/route.ts`, `app/api/league/[id]/players/route.ts`, `app/api/league/[id]/players/[name]/route.ts`, `app/api/league/[id]/players/[name]/rename/route.ts`, `app/api/league/[id]/guests/name/route.ts`, `app/api/league/[id]/details/route.ts`, `app/api/league/[id]/fees/route.ts` (writes `games.fee_per_player`), `app/api/league/[id]/player-claims/[claimId]/approve/route.ts` and `app/api/league/[id]/join-requests/[requestId]/approve/route.ts` (their RPCs reach `link_reviewed_player`, which can insert a `player_attributes` row)
- Modify: every test that imports one of those routes

- [ ] **Step 1: Add the call**

In each handler listed, immediately before the final successful `return NextResponse.json(...)`, add:

```ts
  revalidateLeague(id)
```

with `import { revalidateLeague } from '@/lib/leagueCache'`. In `details/route.ts` PATCH, which may change the slug, read the current slug before updating and call:

```ts
  revalidateLeague(id, [currentSlug, newSlug].filter(Boolean))
```

where `currentSlug` is the games row's slug before the update and `newSlug` is the value written (the same string when the name did not change).

Rule for later work, to add to the comment at the top of `lib/leagueCache.ts`: any route that writes to `games`, `weeks` or `player_attributes` must call `revalidateLeague`.

- [ ] **Step 2: Mock `next/cache` in the affected route tests**

Run: `grep -rln "app/api/league/\[id\]/\(lineup\|weeks\|players\|guests\|details\)" __tests__`

Add to each listed file, next to its other mocks:

```ts
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }))
```

- [ ] **Step 3: Run everything**

Run: `npx tsc --noEmit && npm test -- --silent 2>&1 | tail -5`
Expected: clean, only the two pre-existing failures.

- [ ] **Step 4: Verify on a Vercel preview, not just locally**

Push the branch and open the PR so Vercel builds a preview. On the preview, as an admin:

1. Open `/craft-football/results` in two browsers, one signed out.
2. Record a result in the admin browser. Expected: after the automatic refresh the result is listed. Reload the signed-out browser. Expected: the result is listed there too, immediately.
3. Rename the league in Settings → League Details (the slug changes). Expected: the new slug resolves at once and the old one 404s or redirects as before.
4. Add a player in Settings → Players. Expected: the Players tab shows them on the next load.

The calls use `{ expire: 0 }` rather than `'max'` because a dynamic render serves a merely stale entry once while it refreshes in the background, which is what the admin's refresh after a save would hit.

- [ ] **Step 5: Commit and finish the PR**

```bash
git add app/api lib/leagueCache.ts __tests__
git commit -m "Invalidate the league cache from every write route"
git push -u origin refactor/pr-11-league-cache
gh pr create --base main --title "Tagged cache over the public league reads" --body "$(cat <<'EOF'
Release 5 of the efficiency refactor.

`getGame`, `getGameBySlug`, `getWeeks` and `getPlayerStats` are now stored across requests with `unstable_cache` under a per-league tag and a 60 s fallback. Every route that writes to games, weeks or player_attributes calls `revalidateLeague`. `ensureUnrecordedWeek`, which writes during render and cannot invalidate, re-reads uncached when it finds the cache behind.

Verified on the preview: (describe the four checks)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Release 6 (0.9.0): Maintainability

## PR 12: Split `lib/utils.ts` by domain

Branch: `refactor/pr-12-split-utils`

`lib/utils.ts` is 1,641 lines and 92 exports covering dates, rating maths, share text, standings and review logic, imported by 87 files. Tree-shaking keeps it out of the bundle, so this is a developer cost rather than a runtime one, but it is the reason `app/page.tsx` re-implements two date helpers. The split moves code into five modules and leaves `lib/utils.ts` re-exporting them, so no import elsewhere changes in this PR. Tests under `lib/__tests__/utils.*.test.ts` keep importing from `@/lib/utils` and go on passing.

### Task 24: Move the code

**Files:**
- Create: `lib/dates.ts`, `lib/rating.ts`, `lib/shareText.ts`, `lib/standings.ts`, `lib/review.ts`
- Modify: `lib/utils.ts`
- Modify: `app/page.tsx`
- Modify: `CLAUDE.md`

Each move is a cut from `lib/utils.ts` (line numbers are from the current file; re-check with `grep -n "^export" lib/utils.ts` before cutting) and a paste into the new module, with the imports the compiler asks for. Private helpers and constants travel with the first exported function that uses them. If two modules both need a private helper, export it from `lib/dates.ts` and import it in the other.

- [ ] **Step 1: `lib/dates.ts`**

Exports to move: `parseWeekDate` (504), `formatWeekDate` (510), `getNextMatchDate` (522), `dayNameToIndex` (556), `nextOccurrenceAfterToday` (565), `getMonthKey` (137), `formatMonthYear` (143), `parseKickoffTime` (730), `isPastDeadline` (756), `isAwaitingWindowOver` (767), `formatFixtureDate` (774), `getMostRecentExpectedGameDate` (883), `timeAgo` (1578). The month-name tables near `parseWeekDate` go with it.

Header comment:

```ts
// lib/dates.ts
// Week dates ('DD MMM YYYY'), league game days and kick-off deadlines.
```

- [ ] **Step 2: `lib/rating.ts`**

Exports to move: `MAN_ADVANTAGE_PER_PLAYER` (30), `wprScore` (173), `ewptScore` (242), `resolveTeamRatingForResult` (285), `leagueMedianWpr` (298), `WprPercentiles` (308), `leagueWprPercentiles` (319), `HINT_UNKNOWN_MULTIPLIER` and `HINT_EXPLICIT_MULTIPLIER` (349), `hintToWpr` (352), `manAdvantage` (375), `winProbability` (383), `winCopy` (393), plus every constant in the three comment blocks at lines 8 to 28.

Header comment:

```ts
// lib/rating.ts
// Player and team strength: WPR per player, EWPT per team, win probability.
```

- [ ] **Step 3: `lib/shareText.ts`**

Exports to move: `buildShareText` (412), `buildDnfShareText` (454), `computeResultHighlights` (1058), `buildResultShareText` (1151), `resultImageHighlights` (1232), `weeksUpTo` (1256), `playerStatsAsOf` (1267), `ShareOutcome` and `shareOrCopy` (1287), `LINEUP_IMAGE` (1325), `lineupImageFontSize` (1339), `fetchLineupShareUrl` (1369), `fetchShareLink` (1374), `withShareLink` (1382), `leagueShareHref` (1392), `fitFontSize` (1405), `quarterShareKey` (1411), `quarterRangeLabel` (1416), `nextLeagueGame` (1428), `FinalGameShare` (1450), `buildFinalGameLines` (1463), `buildQuarterShareText` (1478), `buildResultHeadline` (1560). The private `postForShareUrl` goes with `fetchLineupShareUrl`.

Header comment:

```ts
// lib/shareText.ts
// Share messages, signed share links and the sizes the preview images use.
```

- [ ] **Step 4: `lib/standings.ts`**

Exports to move: `formatWinner` (57), `formatGoalDiff` (71), `pointsPerGame` (76), `formatPointsPerGame` (81), `compareStandings` (90), `computeStandings` (107), `computeYearStats` (583), `getMarginBarWidth` (701), `getMarginCaption` (713), `ordinalSuffix` (1008).

Header comment:

```ts
// lib/standings.ts
// Points, tables and result formatting.
```

- [ ] **Step 5: `lib/review.ts`**

Exports to move: `pendingRequestsBannerText` (983), `gamesLabel` (1591), `buildReviewItems` (1602), `initialPlaysAs` (1614), `findRosterPlayer` (1623), `reviewProblem` (1629), and the comment block at line 1575.

Header comment:

```ts
// lib/review.ts
// Join request and player claim review (Settings → Members).
```

- [ ] **Step 6: Re-export from `lib/utils.ts`**

What stays in `lib/utils.ts`: `cn`, `generateSlug`, `sortWeeks`, `getPlayedWeeks`, `getNextWeekNumber`, `deriveSeason`, `getSeasonPlayedWeekCount`, `getHeaderSeason`, `getSeasons`, `resolveSelectedYear`, `getLatestResultWeek`, `writeYearParam`, `buildLeagueInfoFacts`, `isLeagueDetailsFilled`, `SITE_TAGLINE`, `pluralise`, `squadFormat`, `gamesPlayedLabel`, `getNextMatchSeed`, `VIEWPORT_COOKIE`, `leagueLandingPath`, `OverviewViewerCard`, `getOverviewViewerCard`, `getLeagueTitleStatus`, `buildLeagueTitle`, `getInitials`, `getAvatarColor`.

Add directly under the imports:

```ts
// Domain modules. Import from them directly in new code; these re-exports
// keep existing imports working.
export * from './dates'
export * from './rating'
export * from './shareText'
export * from './standings'
export * from './review'
```

- [ ] **Step 7: Compile until clean**

Run: `npx tsc --noEmit`
Fix each error by adding the import the new module needs (most will be `parseWeekDate` from `./dates`, `sortWeeks` from `./utils`, or a type from `./types`). Circular imports between `utils.ts` and a domain module are fine for functions, but do not import a value from `./utils` at module top level into a domain module if `utils.ts` also uses that module's value at top level; none of the listed exports do.

- [ ] **Step 8: Run the whole suite**

Run: `npm test -- --silent 2>&1 | tail -5`
Expected: only the two pre-existing failures.

- [ ] **Step 9: Remove the duplicate date helpers from `app/page.tsx`**

Delete the local `MONTH_SHORT`, `MONTH_IDX`, `parseWeekDate` and `formatWeekDate` (lines 15 to 27) and change the `@/lib/utils` import to:

```ts
import { cn, leagueLandingPath, VIEWPORT_COOKIE } from '@/lib/utils'
import { parseWeekDate, formatWeekDate } from '@/lib/dates'
```

`formatDisplayDate` and `buildMatchdayEyebrow` keep working because they only call those two.

- [ ] **Step 10: Update CLAUDE.md**

Replace the sentence "New utility functions go in `lib/utils.ts`." with:

```
New helpers go in the domain module they belong to: `lib/dates.ts` (week dates, game days, deadlines), `lib/rating.ts` (WPR, EWPT, win probability), `lib/shareText.ts` (share messages and links), `lib/standings.ts` (points and tables), `lib/review.ts` (join request and claim review). `lib/utils.ts` keeps `cn()`, season and week helpers, and re-exports the domain modules for existing imports.
```

and in the repository structure block replace the `lib/utils.ts` line with:

```
│   ├── utils.ts              # cn(), season and week helpers; re-exports the domain modules below
│   ├── dates.ts              # Week dates, game days, kick-off deadlines
│   ├── rating.ts             # WPR, EWPT, win probability
│   ├── shareText.ts          # Share messages and signed links
│   ├── standings.ts          # Points, tables, result formatting
│   ├── review.ts             # Join request and claim review
```

- [ ] **Step 11: Commit and open the PR**

```bash
git add lib app/page.tsx CLAUDE.md
git commit -m "Split lib/utils.ts into domain modules"
git push -u origin refactor/pr-12-split-utils
gh pr create --base main --title "Split lib/utils.ts into domain modules" --body "$(cat <<'EOF'
Release 6 of the efficiency refactor.

Moves dates, rating, share text, standings and review helpers out of the 1,641-line `lib/utils.ts` into five modules. `lib/utils.ts` re-exports them, so no import changes elsewhere; new code imports the domain module directly (CLAUDE.md updated). The landing page's duplicate date helpers are gone.

No runtime change.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Deliberately out of scope

- **Splitting `NextMatchCard.tsx`.** PR 5 and PR 10 remove about 120 lines (the browser read and its mapping, the RPC plumbing). What remains is one component with building, line-up, cancelled and share concerns. Splitting it needs its own design pass once those PRs have landed; do not attempt it inside this plan.
- **`InviteAccept.tsx`** keeps the Supabase browser SDK. It only loads on `/invite`, and its preview-then-accept flow depends on the browser session. Moving it server-side is a separate change.
- **Test speed.** Already transpile-only and about 8 s; nothing to do.
- **Promoting `unstable_cache` to `'use cache'`.** That needs `cacheComponents` in `next.config.js` and a wider audit of dynamic reads. Revisit when the Next 16 cache directive is stable for this app.

# Self-review notes

- Every investigation finding maps to a PR: bundle (PR 4, PR 10), navbar (PR 3), settings waterfalls (PR 6, PR 7), auth round trips (PR 2 seam, PR 8, PR 9), cross-request cache (PR 11), utils split (PR 12), small tidy-ups (PR 1). The next match card's hidden browser read, found during planning, is PR 5.
- Names used across tasks: `requireUser` / `requireLeagueAdmin` returning `{ user } | { response }` (PR 2, used in PR 10 routes); `ApiUser` becomes an alias of `SessionUser` in PR 8; `mockAuthNamespace` (PR 8, used by PR 10 tests); `SettingsSection` exported from `components/LeagueSettings.tsx` and imported by the page; `AccountData` exported from `lib/fetchers.ts`; `revalidateLeague(id, slugs)` (PR 11); `readWeeks` is the uncached reader `ensureUnrecordedWeek` calls.
- Order dependencies: PR 6 needs PR 3 (navbar no longer calls `/api/games`) before deleting that route. PR 9 needs PR 6 (the page owns the admin check). PR 10 needs PR 2 (`requireLeagueAdmin`) and PR 8 (`mockAuthNamespace` in its tests). PR 11 needs PR 10 (writes pass through the server).
