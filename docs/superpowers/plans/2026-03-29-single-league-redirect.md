# Single-League Auto-Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redirect authenticated users with exactly one league membership directly to that league's results page when they visit `/`.

**Architecture:** Add a two-line guard in `app/page.tsx` immediately after the `leagues` array is built. If `leagues.length === 1`, call Next.js `redirect()` to `/{leagueId}/results`. No new files, no new dependencies.

**Tech Stack:** Next.js 14 App Router, TypeScript, `redirect` from `next/navigation`

---

### Task 1: Add single-league redirect to `app/page.tsx`

**Files:**
- Modify: `app/page.tsx:76-83`

- [ ] **Step 1: Add `redirect` to the `next/navigation` import**

Open `app/page.tsx`. There is currently no import from `next/navigation`. Add one at the top of the file, after the existing imports:

```ts
import { redirect } from 'next/navigation'
```

The import block at the top of the file should look like:

```ts
export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
```

- [ ] **Step 2: Add the redirect guard after the `leagues` array is built**

Locate the block starting at line ~76 that builds the `leagues` array:

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

Immediately after that closing `})`, add:

```ts
if (leagues.length === 1) {
  redirect(`/${leagues[0].id}/results`)
}
```

The full block should now read:

```ts
const leagues = (memberships ?? []).map((m) => {
  const game = (m.games as unknown as { id: string; name: string } | null)
  return {
    id: game?.id ?? '',
    name: game?.name ?? '',
    role: m.role,
  }
})

if (leagues.length === 1) {
  redirect(`/${leagues[0].id}/results`)
}
```

- [ ] **Step 3: Verify the build passes**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manually verify behaviour**

Start the dev server (`npm run dev`) and sign in as a user with exactly one league membership. Navigate to `/`. You should land on `/{leagueId}/results` without seeing the league list.

Also verify:
- A user with 0 leagues sees "You're not in any leagues yet."
- A user with 2+ leagues sees the league list.
- An unauthenticated visitor sees the public league directory.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: redirect single-league members directly to their league"
```
