# URL Slug Redirect Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add permanent redirect pages at the old UUID-based URLs so that existing bookmarks and shared links continue to work after the slug migration.

**Architecture:** Each old route gets a minimal Next.js server component that calls the existing `getGame(id)` fetcher, looks up the slug, and issues a permanent redirect to the equivalent slug-based URL. Two unused components (`Header.tsx`, `PublicHeader.tsx`) containing stale UUID URL patterns are deleted.

**Tech Stack:** Next.js 14 App Router, TypeScript, `lib/fetchers.ts` (`getGame`), `next/navigation` (`redirect`, `notFound`)

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| Create | `app/results/[id]/page.tsx` | Redirect `/results/{uuid}` → `/{slug}/results` |
| Create | `app/results/[id]/players/page.tsx` | Redirect `/results/{uuid}/players` → `/{slug}/players` |
| Create | `app/app/league/[id]/page.tsx` | Redirect `/app/league/{uuid}` → `/{slug}/results` |
| Create | `app/app/league/[id]/players/page.tsx` | Redirect `/app/league/{uuid}/players` → `/{slug}/players` |
| Create | `app/app/league/[id]/settings/page.tsx` | Redirect `/app/league/{uuid}/settings` → `/{slug}/settings` |
| Delete | `components/Header.tsx` | Dead code with stale UUID URLs |
| Delete | `components/PublicHeader.tsx` | Dead code with stale UUID URLs |

---

### Task 1: Create `/results/[id]` redirect page

**Files:**
- Create: `app/results/[id]/page.tsx`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p app/results/\[id\]
```

- [ ] **Step 2: Write the redirect page**

Create `app/results/[id]/page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { getGame } from '@/lib/fetchers'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LegacyResultsPage({ params }: Props) {
  const { id } = await params
  const game = await getGame(id)
  if (!game) notFound()
  redirect(`/${game.slug}/results`)
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/results/\[id\]/page.tsx
git commit -m "feat: redirect /results/[uuid] to /[slug]/results"
```

---

### Task 2: Create `/results/[id]/players` redirect page

**Files:**
- Create: `app/results/[id]/players/page.tsx`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p app/results/\[id\]/players
```

- [ ] **Step 2: Write the redirect page**

Create `app/results/[id]/players/page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { getGame } from '@/lib/fetchers'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LegacyResultsPlayersPage({ params }: Props) {
  const { id } = await params
  const game = await getGame(id)
  if (!game) notFound()
  redirect(`/${game.slug}/players`)
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/results/\[id\]/players/page.tsx
git commit -m "feat: redirect /results/[uuid]/players to /[slug]/players"
```

---

### Task 3: Create `/app/league/[id]` redirect page

**Files:**
- Create: `app/app/league/[id]/page.tsx`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p "app/app/league/[id]"
```

- [ ] **Step 2: Write the redirect page**

Create `app/app/league/[id]/page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { getGame } from '@/lib/fetchers'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LegacyLeaguePage({ params }: Props) {
  const { id } = await params
  const game = await getGame(id)
  if (!game) notFound()
  redirect(`/${game.slug}/results`)
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/app/league/[id]/page.tsx"
git commit -m "feat: redirect /app/league/[uuid] to /[slug]/results"
```

---

### Task 4: Create `/app/league/[id]/players` redirect page

**Files:**
- Create: `app/app/league/[id]/players/page.tsx`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p "app/app/league/[id]/players"
```

- [ ] **Step 2: Write the redirect page**

Create `app/app/league/[id]/players/page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { getGame } from '@/lib/fetchers'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LegacyLeaguePlayersPage({ params }: Props) {
  const { id } = await params
  const game = await getGame(id)
  if (!game) notFound()
  redirect(`/${game.slug}/players`)
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/app/league/[id]/players/page.tsx"
git commit -m "feat: redirect /app/league/[uuid]/players to /[slug]/players"
```

---

### Task 5: Create `/app/league/[id]/settings` redirect page

**Files:**
- Create: `app/app/league/[id]/settings/page.tsx`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p "app/app/league/[id]/settings"
```

- [ ] **Step 2: Write the redirect page**

Create `app/app/league/[id]/settings/page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { getGame } from '@/lib/fetchers'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LegacyLeagueSettingsPage({ params }: Props) {
  const { id } = await params
  const game = await getGame(id)
  if (!game) notFound()
  redirect(`/${game.slug}/settings`)
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/app/league/[id]/settings/page.tsx"
git commit -m "feat: redirect /app/league/[uuid]/settings to /[slug]/settings"
```

---

### Task 6: Delete dead code components

**Files:**
- Delete: `components/Header.tsx`
- Delete: `components/PublicHeader.tsx`

- [ ] **Step 1: Confirm neither file is imported anywhere**

```bash
grep -r "from.*components/Header\b\|from.*Header'" app components --include="*.tsx" --include="*.ts"
grep -r "from.*components/PublicHeader\|from.*PublicHeader'" app components --include="*.tsx" --include="*.ts"
```

Expected: no output for either command. If any output appears, stop and investigate before deleting.

- [ ] **Step 2: Delete the files**

```bash
rm components/Header.tsx components/PublicHeader.tsx
```

- [ ] **Step 3: Verify TypeScript still compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run the test suite to confirm nothing broke**

```bash
npm test
```

Expected: all tests pass (same count as before this task).

- [ ] **Step 5: Commit**

```bash
git add -u components/Header.tsx components/PublicHeader.tsx
git commit -m "chore: delete unused Header and PublicHeader components"
```

---

### Task 7: Manual smoke test

These are server-side redirects — they can't be unit-tested in Jest. Verify against a running dev server.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Find a real game UUID to test with**

Look in the Supabase dashboard or run:

```bash
# In a Supabase SQL editor or psql:
SELECT id, slug FROM games LIMIT 3;
```

Note one `id` (UUID) and its corresponding `slug`.

- [ ] **Step 3: Test each redirect**

Replace `{uuid}` with the UUID and `{slug}` with the expected slug:

```bash
curl -I http://localhost:3000/results/{uuid}
# Expect: HTTP 308, Location: /{slug}/results

curl -I http://localhost:3000/results/{uuid}/players
# Expect: HTTP 308, Location: /{slug}/players

curl -I http://localhost:3000/app/league/{uuid}
# Expect: HTTP 308, Location: /{slug}/results

curl -I http://localhost:3000/app/league/{uuid}/players
# Expect: HTTP 308, Location: /{slug}/players

curl -I http://localhost:3000/app/league/{uuid}/settings
# Expect: HTTP 308, Location: /{slug}/settings
```

- [ ] **Step 4: Test the 404 case**

```bash
curl -I http://localhost:3000/results/00000000-0000-0000-0000-000000000000
# Expect: HTTP 404
```

- [ ] **Step 5: Test in browser**

Navigate to `http://localhost:3000/results/{uuid}` in a browser. Confirm it lands on `/{slug}/results` with no error.
