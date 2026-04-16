# League Slug URLs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw UUIDs in league URLs with human-readable slugs derived from the league name (e.g. `/the-boot-room/results` instead of `/3f2a1b4c-.../results`).

**Architecture:** A `slug` column is added to `games` (unique, indexed). The `app/[leagueId]/` route directory is renamed to `app/[slug]/`. A cached `getGameBySlug(slug)` fetcher resolves the slug to a UUID at the layout level; all child pages call the same cached function to get the UUID and continue to pass it to existing fetchers. The UUID never appears in the URL. Share-text URLs are updated to use slug. API routes remain UUID-based throughout.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL), TypeScript, React `cache()`, Jest

---

## File Map

| File | Change |
|---|---|
| `supabase/migrations/YYYYMMDD_add_slug_to_games.sql` | Create — add/backfill/constrain slug column |
| `lib/utils.ts` | Modify — add `generateSlug()` |
| `lib/slug.ts` | Create — `resolveUniqueSlug()` (DB-aware, server-only) |
| `__tests__/slug.test.ts` | Create — unit tests for `generateSlug()` |
| `lib/types.ts` | Modify — add `slug` to `Game` interface |
| `lib/fetchers.ts` | Modify — add `slug` to `getGame()` select; add `getGameBySlug()` |
| `app/api/games/route.ts` | Modify — return `slug` in GET response |
| `app/[leagueId]/` → `app/[slug]/` | Rename directory |
| `app/[slug]/layout.tsx` | Modify — resolve slug→UUID via `getGameBySlug` |
| `app/[slug]/page.tsx` | Modify — use slug param |
| `app/[slug]/results/page.tsx` | Modify — resolve slug→UUID |
| `app/[slug]/players/page.tsx` | Modify — resolve slug→UUID |
| `app/[slug]/lineup-lab/page.tsx` | Modify — resolve slug→UUID |
| `app/[slug]/honours/page.tsx` | Modify — resolve slug→UUID |
| `app/[slug]/settings/page.tsx` | Modify — resolve slug→UUID for API calls |
| `app/api/league/[id]/details/route.ts` | Modify — recompute slug on name change |
| `lib/utils.ts` | Modify — rename `leagueId` → `leagueSlug` in share text functions |
| `components/NextMatchCard.tsx` | Modify — add `leagueSlug` prop for share URL |
| `components/MatchCard.tsx` | Modify — rename `shareGameId` → `leagueSlug` prop |
| `components/ResultModal.tsx` | Modify — accept `leagueSlug` prop |
| `components/LeagueDetailsForm.tsx` | Modify — show live URL preview |
| `app/page.tsx` | Modify — use slug in league list links |
| `components/ui/navbar.tsx` | Modify — read `slug` from params, match by slug |

---

## Task 1: DB Migration — Add Slug Column

**Files:**
- Create: `supabase/migrations/20260416000001_add_slug_to_games.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260416000001_add_slug_to_games.sql`:

```sql
-- Step 1: Add nullable slug column
ALTER TABLE games ADD COLUMN IF NOT EXISTS slug text;

-- Step 2: Backfill slugs from existing names using the same rules as generateSlug():
--   lowercase, non-alphanumeric runs → hyphens, strip leading/trailing hyphens.
-- Handles collisions by appending -2, -3, etc.
DO $$
DECLARE
  rec RECORD;
  base_slug text;
  candidate text;
  counter int;
BEGIN
  FOR rec IN SELECT id, name FROM games WHERE slug IS NULL ORDER BY created_at LOOP
    base_slug := lower(regexp_replace(trim(both '-' from regexp_replace(rec.name, '[^a-zA-Z0-9]+', '-', 'g')), '^-+|-+$', '', 'g'));
    candidate := base_slug;
    counter := 2;
    WHILE EXISTS (SELECT 1 FROM games WHERE slug = candidate AND id != rec.id) LOOP
      candidate := base_slug || '-' || counter;
      counter := counter + 1;
    END LOOP;
    UPDATE games SET slug = candidate WHERE id = rec.id;
  END LOOP;
END $$;

-- Step 3: Apply NOT NULL and UNIQUE constraints
ALTER TABLE games ALTER COLUMN slug SET NOT NULL;
ALTER TABLE games ADD CONSTRAINT games_slug_unique UNIQUE (slug);
CREATE INDEX IF NOT EXISTS idx_games_slug ON games(slug);
```

- [ ] **Step 2: Run the migration in Supabase SQL Editor**

Paste the migration SQL into the Supabase SQL Editor for your project and execute it. Verify it succeeds with no errors.

- [ ] **Step 3: Verify slug was created correctly**

Run in Supabase SQL Editor:

```sql
SELECT id, name, slug FROM games;
```

Expected: each row has a slug that is lowercase, hyphenated, and matches the name (e.g. `"The Boot Room"` → `"the-boot-room"`).

---

## Task 2: `generateSlug()` Utility + Tests

**Files:**
- Modify: `lib/utils.ts` (add `generateSlug`)
- Create: `__tests__/slug.test.ts`
- Create: `lib/slug.ts` (add `resolveUniqueSlug`)

- [ ] **Step 1: Write the failing tests**

Create `__tests__/slug.test.ts`:

```ts
import { generateSlug } from '@/lib/utils'

describe('generateSlug', () => {
  it('lowercases and hyphenates a simple name', () => {
    expect(generateSlug('The Boot Room')).toBe('the-boot-room')
  })

  it('collapses multiple non-alphanumeric chars into a single hyphen', () => {
    expect(generateSlug('Boot  Room!!  FC')).toBe('boot-room-fc')
  })

  it('strips leading and trailing hyphens', () => {
    expect(generateSlug('  !!Boot Room!!  ')).toBe('boot-room')
  })

  it('handles numbers in the name', () => {
    expect(generateSlug('League 5 FC')).toBe('league-5-fc')
  })

  it('handles a name that is already a valid slug', () => {
    expect(generateSlug('the-boot-room')).toBe('the-boot-room')
  })

  it('handles special characters', () => {
    expect(generateSlug("Lads' FC — Sunday")).toBe('lads-fc-sunday')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- --testPathPattern="slug" --no-coverage
```

Expected: FAIL with `generateSlug is not a function` or similar.

- [ ] **Step 3: Add `generateSlug` to `lib/utils.ts`**

Add after the `cn()` function (around line 7):

```ts
/** Convert a league name to a URL slug: lowercase, hyphens only, no leading/trailing hyphens. */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- --testPathPattern="slug" --no-coverage
```

Expected: PASS (6 tests passing).

- [ ] **Step 5: Create `lib/slug.ts` with `resolveUniqueSlug`**

Create `lib/slug.ts`:

```ts
import { generateSlug } from '@/lib/utils'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Generates a unique slug for a league name.
 * Queries the DB to check uniqueness, appending -2, -3, etc. on collision.
 *
 * @param name - The league name to slugify
 * @param excludeId - The game UUID to exclude when checking (use during rename
 *   so the current league's own slug is not treated as a collision)
 */
export async function resolveUniqueSlug(name: string, excludeId?: string): Promise<string> {
  const service = createServiceClient()
  const base = generateSlug(name)
  let candidate = base
  let counter = 2

  while (true) {
    let query = service
      .from('games')
      .select('id')
      .eq('slug', candidate)

    if (excludeId) {
      query = query.neq('id', excludeId)
    }

    const { data } = await query.maybeSingle()
    if (!data) return candidate

    candidate = `${base}-${counter}`
    counter++
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/utils.ts lib/slug.ts __tests__/slug.test.ts supabase/migrations/20260416000001_add_slug_to_games.sql
git commit -m "feat: add generateSlug utility and resolveUniqueSlug helper"
```

---

## Task 3: Update `Game` Type, Fetchers, and `/api/games` Route

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/fetchers.ts`
- Modify: `app/api/games/route.ts`

- [ ] **Step 1: Add `slug` to the `Game` interface in `lib/types.ts`**

Find:
```ts
export interface Game {
  id: string;
  name: string;
  created_at: string;
  role: GameRole;
}
```

Replace with:
```ts
export interface Game {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  role: GameRole;
}
```

- [ ] **Step 2: Update `getGame()` to select `slug` in `lib/fetchers.ts`**

Find:
```ts
export const getGame = cache(async (leagueId: string) => {
  const service = createServiceClient()
  const { data } = await service
    .from('games')
    .select('id, name, location, day, kickoff_time, bio')
    .eq('id', leagueId)
    .maybeSingle()
  return data
})
```

Replace with:
```ts
export const getGame = cache(async (leagueId: string) => {
  const service = createServiceClient()
  const { data } = await service
    .from('games')
    .select('id, name, slug, location, day, kickoff_time, bio')
    .eq('id', leagueId)
    .maybeSingle()
  return data
})
```

- [ ] **Step 3: Add `getGameBySlug()` to `lib/fetchers.ts`**

Add directly after the `getGame` function:

```ts
export const getGameBySlug = cache(async (slug: string) => {
  const service = createServiceClient()
  const { data } = await service
    .from('games')
    .select('id, name, slug, location, day, kickoff_time, bio')
    .eq('slug', slug)
    .maybeSingle()
  return data
})
```

- [ ] **Step 4: Update `/api/games/route.ts` to return `slug`**

Find:
```ts
  const games = (data ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    created_at: g.created_at,
    role: (g.game_members as unknown as { role: string }[])[0]?.role ?? 'member',
  }))
```

Replace with:
```ts
  const games = (data ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    slug: g.slug,
    created_at: g.created_at,
    role: (g.game_members as unknown as { role: string }[])[0]?.role ?? 'member',
  }))
```

Also update the select to include `slug`:

Find:
```ts
    .select('id, name, created_at, game_members!inner(role)')
```

Replace with:
```ts
    .select('id, name, slug, created_at, game_members!inner(role)')
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/fetchers.ts app/api/games/route.ts
git commit -m "feat: add slug to Game type, getGame, getGameBySlug, and /api/games"
```

---

## Task 4: Rename Route Directory + Update Layout

**Files:**
- Rename: `app/[leagueId]/` → `app/[slug]/`
- Modify: `app/[slug]/layout.tsx`

- [ ] **Step 1: Rename the route directory**

```bash
mv "app/[leagueId]" "app/[slug]"
```

- [ ] **Step 2: Update the layout**

Open `app/[slug]/layout.tsx`. Replace the entire file with:

```tsx
import { notFound } from 'next/navigation'
import { getGameBySlug, getAuthAndRole, getFeatures } from '@/lib/fetchers'

interface Props {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export default async function LeagueLayout({ children, params }: Props) {
  const { slug } = await params
  // Resolve slug → game (includes UUID). Pre-warm all shared fetchers in parallel.
  // Pages call these same cached functions — no extra DB queries.
  const game = await getGameBySlug(slug)
  if (!game) notFound()

  await Promise.all([
    getAuthAndRole(game.id),
    getFeatures(game.id),
  ])

  return <>{children}</>
}
```

- [ ] **Step 3: Update `app/[slug]/page.tsx` (redirect)**

Replace the entire file with:

```tsx
import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function LeagueRootPage({ params }: Props) {
  const { slug } = await params
  redirect(`/${slug}/results`)
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: Errors only on files that still reference `leagueId` from params — those are fixed in the next task.

- [ ] **Step 5: Commit**

```bash
git add "app/[slug]"
git commit -m "feat: rename [leagueId] route to [slug], update layout to resolve slug"
```

---

## Task 5: Update Child Pages to Resolve Slug → UUID

**Files:**
- Modify: `app/[slug]/results/page.tsx`
- Modify: `app/[slug]/players/page.tsx`
- Modify: `app/[slug]/lineup-lab/page.tsx`
- Modify: `app/[slug]/honours/page.tsx`

Each page currently does:
```ts
const { leagueId } = await params
const [auth, game, features, ...] = await Promise.all([getAuthAndRole(leagueId), getGame(leagueId), getFeatures(leagueId), ...])
```

After: resolve slug → UUID via the cached `getGameBySlug`, then pass the UUID to remaining fetchers.

- [ ] **Step 1: Update `app/[slug]/results/page.tsx`**

Find the params destructure and the Promise.all:
```ts
  params: Promise<{ leagueId: string }>
```
Replace with:
```ts
  params: Promise<{ slug: string }>
```

Find:
```ts
  const { leagueId } = await params
  // Pre-warm all shared fetchers in parallel. Pages call these same functions
  // and receive the cached results — no extra DB queries.
  const [
    { user, userRole, isAuthenticated },
    game,
    features,
    players,
    weeks,
    pendingBadgeCount,
  ] = await Promise.all([
    getAuthAndRole(leagueId),
    getGame(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
    getPendingBadgeCount(leagueId),  // returns 0 for non-admins (RPC denies access)
  ])
```

Replace with:
```ts
  const { slug } = await params
  // Resolve slug → game (cache hit from layout). Then fan out remaining fetchers.
  const game = await getGameBySlug(slug)
  if (!game) notFound()
  const leagueId = game.id

  const [
    { user, userRole, isAuthenticated },
    features,
    players,
    weeks,
    pendingBadgeCount,
  ] = await Promise.all([
    getAuthAndRole(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
    getPendingBadgeCount(leagueId),  // returns 0 for non-admins (RPC denies access)
  ])
```

Update the import at the top of the file to include `getGameBySlug` and `notFound`:
```ts
import { notFound } from 'next/navigation'
import { getGame, getGameBySlug, getAuthAndRole, getFeatures, getPlayerStats, getWeeks, getPendingBadgeCount, getJoinRequestStatus, getMyClaimInfo } from '@/lib/fetchers'
```

(Remove `getGame` from imports if it's no longer used in this file after the change.)

- [ ] **Step 2: Update `app/[slug]/players/page.tsx`**

Apply the same pattern as results. Find:
```ts
  params: Promise<{ leagueId: string }>
```
Replace with:
```ts
  params: Promise<{ slug: string }>
```

Find:
```ts
  const { leagueId } = await params
  const [
    { user, userRole, isAuthenticated },
    game,
    features,
    players,
    weeks,
    pendingBadgeCount,
  ] = await Promise.all([
    getAuthAndRole(leagueId),
    getGame(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
    getPendingBadgeCount(leagueId),  // returns 0 for non-admins
  ])
```

Replace with:
```ts
  const { slug } = await params
  const game = await getGameBySlug(slug)
  if (!game) notFound()
  const leagueId = game.id

  const [
    { user, userRole, isAuthenticated },
    features,
    players,
    weeks,
    pendingBadgeCount,
  ] = await Promise.all([
    getAuthAndRole(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
    getPendingBadgeCount(leagueId),  // returns 0 for non-admins
  ])
```

Update imports to include `getGameBySlug` and `notFound`; remove `getGame` if unused.

- [ ] **Step 3: Update `app/[slug]/lineup-lab/page.tsx`**

Apply the same pattern. Find:
```ts
  params: Promise<{ leagueId: string }>
```
Replace with:
```ts
  params: Promise<{ slug: string }>
```

Find:
```ts
  const { leagueId } = await params
  const [
    { user, userRole, isAuthenticated },
    game,
    features,
    players,
    weeks,
    pendingBadgeCount,
  ] = await Promise.all([
    getAuthAndRole(leagueId),
    getGame(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
    getPendingBadgeCount(leagueId),
  ])
```

Replace with:
```ts
  const { slug } = await params
  const game = await getGameBySlug(slug)
  if (!game) notFound()
  const leagueId = game.id

  const [
    { user, userRole, isAuthenticated },
    features,
    players,
    weeks,
    pendingBadgeCount,
  ] = await Promise.all([
    getAuthAndRole(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
    getPendingBadgeCount(leagueId),
  ])
```

Update imports.

- [ ] **Step 4: Update `app/[slug]/honours/page.tsx`**

Apply the same pattern. Find:
```ts
  params: Promise<{ leagueId: string }>
```
Replace with:
```ts
  params: Promise<{ slug: string }>
```

Apply the same slug→UUID resolution pattern as above. Update imports.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors (or only errors in files not yet updated).

- [ ] **Step 6: Commit**

```bash
git add "app/[slug]/results/page.tsx" "app/[slug]/players/page.tsx" "app/[slug]/lineup-lab/page.tsx" "app/[slug]/honours/page.tsx"
git commit -m "feat: update child pages to resolve slug→UUID via getGameBySlug"
```

---

## Task 6: Update Share Text Functions + Components

Share URLs currently embed the UUID. Update `buildShareText` and `buildResultShareText` in `lib/utils.ts` to take `leagueSlug` instead of `leagueId`, then update all callers.

**Files:**
- Modify: `lib/utils.ts`
- Modify: `components/NextMatchCard.tsx`
- Modify: `components/MatchCard.tsx`
- Modify: `components/ResultModal.tsx`
- Modify: `app/[slug]/results/page.tsx`
- Modify: `app/[slug]/lineup-lab/page.tsx`

- [ ] **Step 1: Update `buildShareText` in `lib/utils.ts`**

Find the `buildShareText` params interface:
```ts
export function buildShareText(params: {
  leagueName: string
  leagueId: string
  week: number
  ...
```

Replace `leagueId: string` with `leagueSlug: string`.

Find the destructure inside `buildShareText`:
```ts
  const { leagueName, leagueId, week, date, format, teamA, teamB, teamARating, teamBRating } = params
```

Replace `leagueId` with `leagueSlug`.

Find the URL line inside `buildShareText`:
```ts
    `🔗 https://craft-football.com/${leagueId}`,
```

Replace with:
```ts
    `🔗 https://craft-football.com/${leagueSlug}`,
```

- [ ] **Step 2: Update `buildResultShareText` in `lib/utils.ts`**

Find the `buildResultShareText` params interface:
```ts
export function buildResultShareText(params: {
  leagueName: string
  leagueId: string
  week: number
  ...
```

Replace `leagueId: string` with `leagueSlug: string`.

Find the destructure inside `buildResultShareText`:
```ts
  const {
    leagueName, leagueId, week, date, format,
    ...
  } = params
```

Replace `leagueId` with `leagueSlug`.

Find the URL line inside `buildResultShareText`:
```ts
  parts.push(`🔗 https://craft-football.com/${leagueId}`)
```

Replace with:
```ts
  parts.push(`🔗 https://craft-football.com/${leagueSlug}`)
```

- [ ] **Step 3: Update `NextMatchCard` to accept and use `leagueSlug`**

In `components/NextMatchCard.tsx`, find the props interface and add `leagueSlug: string`:

```ts
// Find the inner component or main props that include:
  gameId: string
// Add alongside it:
  leagueSlug: string
```

Find the `buildShareText` call:
```ts
    const text = buildShareText({
      ...
      leagueId: gameId,
```

Replace `leagueId: gameId` with `leagueSlug: leagueSlug`.

Destructure `leagueSlug` from props alongside `gameId`.

- [ ] **Step 4: Update `MatchCard` to rename `shareGameId` → `leagueSlug`**

In `components/MatchCard.tsx`, find:
```ts
  shareGameId?: string
```

Replace with:
```ts
  leagueSlug?: string
```

Find:
```ts
    if (!leagueName || !shareGameId || !weeks || !week.winner) return
    const { shareText } = buildResultShareText({
      ...
      leagueId: shareGameId,
```

Replace with:
```ts
    if (!leagueName || !leagueSlug || !weeks || !week.winner) return
    const { shareText } = buildResultShareText({
      ...
      leagueSlug,
```

Update all other references to `shareGameId` in this file to `leagueSlug`.

- [ ] **Step 5: Update `ResultModal` to use `leagueSlug`**

In `components/ResultModal.tsx`, find the call to `buildResultShareText`:
```ts
      const { shareText, highlightsText } = buildResultShareText({
        leagueName: ...,
        leagueId: ...,
```

Replace `leagueId: ...` with `leagueSlug: ...`. Trace back to where the prop comes from and rename/add `leagueSlug` in the props interface.

- [ ] **Step 6: Update pages that render these components**

In `app/[slug]/results/page.tsx`, find where `NextMatchCard` and `MatchCard` are rendered:
- `<NextMatchCard ... gameId={leagueId} ...>` — add `leagueSlug={game.slug}`
- `<MatchCard ... shareGameId={leagueId} ...>` — change to `leagueSlug={game.slug}`

In `app/[slug]/lineup-lab/page.tsx`:
- Find `<LineupLab ... leagueId={leagueId} ...>` — check if it passes to `NextMatchCard` internally; if `leagueId` prop on `LineupLab` is used only for API calls (not share URL), add a separate `leagueSlug={game.slug}` prop.

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 8: Run tests**

```bash
npm test -- --no-coverage
```

Expected: All passing.

- [ ] **Step 9: Commit**

```bash
git add lib/utils.ts components/NextMatchCard.tsx components/MatchCard.tsx components/ResultModal.tsx "app/[slug]/results/page.tsx" "app/[slug]/lineup-lab/page.tsx"
git commit -m "feat: use leagueSlug in share URLs instead of UUID"
```

---

## Task 7: Update Details PATCH Route to Recompute Slug on Rename

When an admin updates the league name, the slug must be recomputed.

**Files:**
- Modify: `app/api/league/[id]/details/route.ts`

- [ ] **Step 1: Update the PATCH handler**

In `app/api/league/[id]/details/route.ts`, find the section that extracts the name and updates the row:

```ts
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const service = createServiceClient()
  const { error } = await service
    .from('games')
    .update({ name, location, day, kickoff_time, bio })
    .eq('id', id)
```

Replace with:

```ts
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const slug = await resolveUniqueSlug(name, id)

  const service = createServiceClient()
  const { error } = await service
    .from('games')
    .update({ name, slug, location, day, kickoff_time, bio })
    .eq('id', id)
```

Add the import at the top of the file:

```ts
import { resolveUniqueSlug } from '@/lib/slug'
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/league/[id]/details/route.ts
git commit -m "feat: recompute slug when league name is updated"
```

---

## Task 8: Update `LeagueDetailsForm` — Show URL Preview

After a name change the admin should see the resulting public URL so they know what slug they're setting.

**Files:**
- Modify: `components/LeagueDetailsForm.tsx`

- [ ] **Step 1: Import `generateSlug` in `LeagueDetailsForm.tsx`**

Find the imports at the top of `components/LeagueDetailsForm.tsx` and add:

```ts
import { generateSlug } from '@/lib/utils'
```

- [ ] **Step 2: Add URL preview beneath the name input**

Find the league name input section. It looks like:

```tsx
{/* League name */}
...
<input
  name="league-name"
  value={name}
  ...
/>
```

Add the preview directly after the input (still inside the field group):

```tsx
{name.trim() && (
  <p className="text-xs text-slate-500 mt-1">
    URL: <span className="text-slate-400">craft-football.com/{generateSlug(name.trim())}</span>
  </p>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/LeagueDetailsForm.tsx
git commit -m "feat: show live URL slug preview in league name field"
```

---

## Task 9: Update League Settings Page (Client Component)

The settings page is a client component that reads `leagueId` from `useParams()` and uses it both as a UUID for API calls and as a URL slug. After renaming the route, `useParams()` returns `slug` — the page must resolve slug → UUID before making API calls.

**Files:**
- Modify: `app/[slug]/settings/page.tsx`

- [ ] **Step 1: Update `useParams` read and resolution**

Find:
```ts
  const leagueId = (params?.leagueId as string) ?? ''
```

Replace with:
```ts
  const slug = (params?.slug as string) ?? ''
  const [leagueId, setLeagueId] = useState('')
```

In the `init` useEffect that calls `fetchGames()`:

Find:
```ts
        const games = await fetchGames()
        const game = games.find((g) => g.id === leagueId)
        if (!game) { router.replace('/'); return }
        setLeagueName(game.name)
        const adminRoles = ['creator', 'admin']
        if (!adminRoles.includes(game.role)) {
          router.replace(`/${leagueId}/results`)
          return
        }
```

Replace with:
```ts
        const games = await fetchGames()
        const game = games.find((g) => g.slug === slug)
        if (!game) { router.replace('/'); return }
        setLeagueId(game.id)
        setLeagueName(game.name)
        const adminRoles = ['creator', 'admin']
        if (!adminRoles.includes(game.role)) {
          router.replace(`/${slug}/results`)
          return
        }
```

Update the `useEffect` dependency arrays from `[leagueId, router]` to `[slug, router]` (and similar for other callbacks that depend on slug).

Note: All `fetch` calls to `/api/league/${leagueId}/...` remain correct because `leagueId` is now the resolved UUID from state (set after `fetchGames`).

- [ ] **Step 2: Update ArrowLeft back link**

Find any back navigation link that uses `leagueId` as a URL slug and update it to use `slug`:

```tsx
href={`/${slug}/results`}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add "app/[slug]/settings/page.tsx"
git commit -m "feat: update league settings page to resolve slug→UUID"
```

---

## Task 10: Update Home Page + Navbar

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/ui/navbar.tsx`

- [ ] **Step 1: Update `app/page.tsx` to use slug in links**

Find the authenticated leagues section. The query currently selects:
```ts
      .select('game_id, role, games(id, name)')
```

Replace with:
```ts
      .select('game_id, role, games(id, name, slug)')
```

Find the leagues mapping:
```ts
    const leagues = (memberships ?? []).map((m) => {
      const game = (m.games as unknown as { id: string; name: string } | null)
      return {
        id: game?.id ?? '',
        name: game?.name ?? '',
        role: m.role,
      }
    })
```

Replace with:
```ts
    const leagues = (memberships ?? []).map((m) => {
      const game = (m.games as unknown as { id: string; name: string; slug: string } | null)
      return {
        id: game?.id ?? '',
        slug: game?.slug ?? '',
        name: game?.name ?? '',
        role: m.role,
      }
    })
```

Find the single-league redirect:
```ts
    if (validLeagues.length === 1) {
      redirect(`/${validLeagues[0].id}/results`)
    }
```

Replace with:
```ts
    if (validLeagues.length === 1) {
      redirect(`/${validLeagues[0].slug}/results`)
    }
```

Find the league list link (in the JSX):
```tsx
                <Link
                  key={league.id}
                  href={`/${league.id}/results`}
```

Replace with:
```tsx
                <Link
                  key={league.id}
                  href={`/${league.slug}/results`}
```

For the unauthenticated public directory, find:
```ts
      const game = (row.games as unknown as { id: string; name: string } | null)
      return {
        id: game?.id ?? '',
        name: game?.name ?? '',
      }
```

Replace with:
```ts
      const game = (row.games as unknown as { id: string; name: string; slug: string } | null)
      return {
        id: game?.id ?? '',
        slug: game?.slug ?? '',
        name: game?.name ?? '',
      }
```

Also update the select for the public league query:
```ts
    service.from('league_features').select('game_id, feature, games(id, name)').eq('public_enabled', true),
```
Replace with:
```ts
    service.from('league_features').select('game_id, feature, games(id, name, slug)').eq('public_enabled', true),
```

And update the public link:
```tsx
            href={`/${league.id}/results`}
```
Replace with:
```tsx
            href={`/${league.slug}/results`}
```

- [ ] **Step 2: Update `navbar.tsx` to use slug**

Find:
```ts
  const leagueId = (params as { leagueId?: string })?.leagueId
```

Replace with:
```ts
  const slug = (params as { slug?: string })?.slug
```

Find:
```ts
          const game = (data ?? []).find((g) => g.id === leagueId)
```

Replace with:
```ts
          const game = (data ?? []).find((g) => g.slug === slug)
```

Find all references to `leagueId` in the rest of the file and replace with `slug`. Specifically:
- `prevLeagueId` state → `prevSlug`
- `if (!leagueId) setIsLeagueAdmin(false)` → `if (!slug) setIsLeagueAdmin(false)`
- `!!leagueId && !isPlayersPage...` → `!!slug && !isPlayersPage...`
- `redirect={leagueId ? \`/${leagueId}/results\` : '/'}` → `redirect={slug ? \`/${slug}/results\` : '/'}`
- `{leagueId && (` → `{slug && (`

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Run all tests**

```bash
npm test -- --no-coverage
```

Expected: All passing.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx components/ui/navbar.tsx
git commit -m "feat: use league slug in home page links and navbar routing"
```

---

## Task 11: Smoke Test End-to-End

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify slug URL navigation**

1. Open `http://localhost:3000` — the league list should show slug-based links (e.g. `/the-boot-room/results`)
2. Click through to the league — URL should be `http://localhost:3000/the-boot-room/results`
3. Navigate to Players, Lineup Lab, Honours, Settings — all slugs in the URL bar
4. On Settings → Details, type a new league name — the URL preview should update live
5. Save the rename — verify the slug changes and the new URL works

- [ ] **Step 3: Verify share text**

Open a lineup with a share button. Tap Share. The copied text should contain `craft-football.com/the-boot-room` (slug) not a UUID.

- [ ] **Step 4: Verify 404 on bad slug**

Navigate to `http://localhost:3000/not-a-real-league/results` — should get a Next.js 404 page.

- [ ] **Step 5: Final commit if any smoke-test fixes were needed**

```bash
git add -A
git commit -m "fix: smoke test fixes for slug URL routing"
```
