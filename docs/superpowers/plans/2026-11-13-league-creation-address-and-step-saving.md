# League address code and step saving — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New leagues get an address of name plus a three-character code, and the `/new` wizard keeps answers across refresh and Back without ever creating a second league.

**Architecture:** The address code is picked in the browser, kept in the wizard draft, and validated by `POST /api/games`, which relies on the unique constraint instead of a look-up. One hook, `useSessionState`, mirrors the three in-memory states (league draft, roster, draft games) to `sessionStorage`. Once a league exists the pre-creation steps PATCH it through the existing details route; the roster save applies recorded removals and derived renames through the existing player routes before its upsert.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Jest 30 with `ts-jest` and Testing Library. No new dependencies, no migration.

**Specs:** `docs/superpowers/specs/2026-11-13-league-address-code-design.md` and `docs/superpowers/specs/2026-11-13-league-creation-step-saving-design.md`.

**Branch:** `awmloveland/league-creation-step-saving`, stacked on `awmloveland/league-creation-polish` (PR #198).

**House rules that bite here** (from `CLAUDE.md`):
- Tailwind classes only, merged with `cn()`. No `style` props, no new CSS.
- British English copy, no em dashes.
- Local dev points at the production database. Do not create leagues or write data while testing; unit tests only. The signed-in browser pass is the user's.
- Commit after every task. End every commit message with
  `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## File map

| File | Change |
|---|---|
| `lib/utils.ts` | add `SLUG_CODE`, `slugCode()` |
| `app/api/games/route.ts` | build the slug from name and code, retry once on a clash |
| `app/api/games/slug/route.ts` | delete |
| `lib/slug.ts`, `lib/__tests__/slug.reserved.test.ts` | delete |
| `components/new-league/useSessionState.ts` | new hook and storage keys |
| `components/new-league/NewLeagueWizard.tsx` | session draft, `code`, `created`, edit path |
| `components/new-league/NameStep.tsx` | local address preview |
| `components/new-league/WhenStep.tsx` | `editing` label |
| `components/new-league/LiveShareCard.tsx` | clear the draft on mount |
| `lib/playerUtils.ts` | add `rosterRenames` |
| `components/new-league/RosterWizard.tsx` | session state, removals, renames |
| `components/new-league/ResultsStep.tsx` | session drafts |
| Tests | `__tests__/slug.test.ts`, `__tests__/api-games.test.ts`, `__tests__/use-session-state.test.tsx`, `__tests__/new-league-wizard.test.tsx`, `lib/__tests__/playerUtils.rosterRenames.test.ts`, `__tests__/roster-wizard.test.tsx` |

Run one test file with `npm test -- <path>`. Type-check with `npx tsc --noEmit`.

---

### Task 1: Address code on the server

**Files:**
- Modify: `lib/utils.ts` (after `generateSlug`, around line 28)
- Modify: `app/api/games/route.ts`
- Delete: `app/api/games/slug/route.ts`, `lib/slug.ts`, `lib/__tests__/slug.reserved.test.ts`
- Test: `__tests__/slug.test.ts`, `__tests__/api-games.test.ts`

- [ ] **Step 1: Write the failing `slugCode` test**

Append to `__tests__/slug.test.ts` and change its import line to
`import { generateSlug, SLUG_CODE, slugCode } from '@/lib/utils'`:

```ts
describe('slugCode', () => {
  it('always returns three characters from the vowel-free alphabet', () => {
    for (let i = 0; i < 200; i++) expect(slugCode()).toMatch(SLUG_CODE)
  })

  it('rejects vowels, capitals, 0, 1 and l', () => {
    for (const bad of ['abc', 'K7X', 'k0x', 'k1x', 'klx', 'k7', 'k7xx']) expect(SLUG_CODE.test(bad)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `npm test -- __tests__/slug.test.ts`
Expected: FAIL, `slugCode is not a function` (or a TypeScript error that the export is missing).

- [ ] **Step 3: Add the code to `lib/utils.ts`**

Directly after the `generateSlug` function:

```ts
const SLUG_CODE_ALPHABET = 'bcdfghjkmnpqrstvwxyz23456789'

/** The suffix on a new league's address. No vowels, so it never spells a word; no 0, 1 or l, so it is never misread. */
export const SLUG_CODE = /^[bcdfghjkmnpqrstvwxyz2-9]{3}$/

/** Three random characters for a league address. Not a secret, so the slight modulo bias does not matter. */
export function slugCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(3)), (n) => SLUG_CODE_ALPHABET[n % SLUG_CODE_ALPHABET.length]).join('')
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npm test -- __tests__/slug.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite the route tests**

In `__tests__/api-games.test.ts`:

Replace the imports and mocks at the top (lines 2 to 9) with:

```ts
import { createClient } from '@/lib/supabase/server'
import { mockAuthNamespace } from '@/lib/__tests__/helpers/supabase-auth'
import { slugCode } from '@/lib/utils'
import { revalidateTag } from 'next/cache'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/utils', () => ({ ...jest.requireActual('@/lib/utils'), slugCode: jest.fn() }))
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }))
```

Replace `VALID` and the `beforeEach`:

```ts
const VALID = { name: 'Hackney Thursdays', day: 'Thursday', kickoff_time: '20:00', location: ' Mabley Green ', bio: '', code: 'k7x' }
const TAKEN = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "games_slug_unique"' } }
```

```ts
beforeEach(() => {
  jest.resetAllMocks()
  ;(slugCode as jest.Mock).mockReturnValue('zzz')
})
```

Replace the two tests `creates the league with the resolved slug…` and `returns 409 slug_taken on a unique violation` with:

```ts
  it('creates the league at name plus the sent code and returns id and slug', async () => {
    setup(USER)
    rpc.mockResolvedValue({ data: 'game-1', error: null })
    const res = await post(VALID)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ id: 'game-1', slug: 'hackney-thursdays-k7x' })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('create_game', {
      p_name: 'Hackney Thursdays',
      p_slug: 'hackney-thursdays-k7x',
      p_location: 'Mabley Green',
      p_day: 'Thursday',
      p_kickoff_time: '20:00',
      p_bio: null,
    })
    expect(revalidateTag).toHaveBeenCalledWith('league:game-1', expect.anything())
    expect(revalidateTag).toHaveBeenCalledWith('league-slug:hackney-thursdays-k7x', expect.anything())
  })

  it.each([
    ['a missing code', undefined],
    ['a code with a vowel', 'abc'],
    ['a code that is not a string', 123],
  ])('replaces %s with a fresh one', async (_label, code) => {
    setup(USER)
    rpc.mockResolvedValue({ data: 'game-1', error: null })
    const res = await post({ ...VALID, code })
    await expect(res.json()).resolves.toEqual({ id: 'game-1', slug: 'hackney-thursdays-zzz' })
  })

  it('retries once with a fresh code when the address is taken', async () => {
    setup(USER)
    rpc.mockResolvedValueOnce(TAKEN).mockResolvedValueOnce({ data: 'game-1', error: null })
    const res = await post(VALID)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ id: 'game-1', slug: 'hackney-thursdays-zzz' })
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('returns 409 slug_taken when the retry is taken too', async () => {
    setup(USER)
    rpc.mockResolvedValue(TAKEN)
    const res = await post(VALID)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'slug_taken' })
    expect(rpc).toHaveBeenCalledTimes(2)
  })
```

Leave the 401, 400 and `maps other RPC errors` tests as they are.

- [ ] **Step 6: Run them and see the new ones fail**

Run: `npm test -- __tests__/api-games.test.ts`
Expected: FAIL. The slug assertions get `hackney-thursdays` or the module `@/lib/slug` errors.

- [ ] **Step 7: Rewrite `app/api/games/route.ts`**

Replace the two import lines for `resolveUniqueSlug` and `generateSlug` with:

```ts
import { generateSlug, SLUG_CODE, slugCode } from '@/lib/utils'
```

Replace the doc comment above `POST` with:

```ts
/**
 * POST — any signed-in user. Creates a league through create_game, which also
 * makes the caller its creator and first player. Returns { id, slug }.
 * The address is the name plus a three-character code: the wizard's when it
 * sends a valid one, so its preview holds, otherwise a fresh one.
 */
```

Replace everything from `const slug = await resolveUniqueSlug(name)` to the end of the function with:

```ts
  const sentCode = typeof b?.code === 'string' && SLUG_CODE.test(b.code) ? b.code : null
  const supabase = await createClient()
  // No look-up first: the unique constraint is the check. One retry with a fresh code covers a clash.
  for (const code of [sentCode ?? slugCode(), slugCode()]) {
    const slug = `${generateSlug(name)}-${code}`
    const { data: id, error } = await supabase.rpc('create_game', {
      p_name: name,
      p_slug: slug,
      p_location: location,
      p_day: day,
      p_kickoff_time: kickoff_time,
      p_bio: bio,
    })
    if (!error) {
      revalidateLeague(id as string, [slug])
      return NextResponse.json({ id, slug })
    }
    if (error.code !== PG_UNIQUE_VIOLATION) {
      return NextResponse.json({ error: error.message }, { status: rpcErrorStatus(error.message) })
    }
  }
  return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
}
```

- [ ] **Step 8: Delete the dead files**

```bash
git rm app/api/games/slug/route.ts lib/slug.ts lib/__tests__/slug.reserved.test.ts
grep -rn "lib/slug'\|api/games/slug\|resolveUniqueSlug" app components lib __tests__ proxy.ts
```

Expected from the grep: one hit, the `fetch('/api/games/slug…` call in `components/new-league/NameStep.tsx`. Task 2 removes it.

- [ ] **Step 9: Run the tests and commit**

Run: `npm test -- __tests__/api-games.test.ts __tests__/slug.test.ts`
Expected: PASS.

```bash
git add -A lib/utils.ts app/api/games __tests__/slug.test.ts __tests__/api-games.test.ts lib/slug.ts lib/__tests__/slug.reserved.test.ts
git commit -m "League address: name plus a three-character code, no look-up before the insert

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 2: Show the real address on the Name step

**Files:**
- Modify: `components/new-league/NewLeagueWizard.tsx`
- Modify: `components/new-league/NameStep.tsx`

No new test here: the preview is one template string and Task 4's wizard test renders it.

- [ ] **Step 1: Add `code` to the draft in `NewLeagueWizard.tsx`**

Add this import below the `next/navigation` one:

```ts
import { slugCode } from '@/lib/utils'
```

In `LeagueDraft`, after `time`:

```ts
  /** The address suffix, picked once so the Name step's preview is the real address. */
  code: string
```

Change `EMPTY`:

```ts
const EMPTY: LeagueDraft = { name: '', bio: '', location: '', day: 'Thursday', time: '20:00', code: '' }
```

Send the code in `postLeague`:

```ts
    body: JSON.stringify({ name: d.name, bio: d.bio, location: d.location, day: d.day, kickoff_time: d.time, code: d.code }),
```

Change `update` so the first edit picks the code (never during render, so server and client render the same):

```ts
  const update = (patch: Partial<LeagueDraft>) => setDraft((d) => ({ ...d, ...patch, code: d.code || slugCode() }))
```

In `create()`, delete these two lines; the route retries a clash itself now:

```ts
      // The server re-resolves the slug, so one retry clears a race on the name.
      if (res.status === 409) res = await postLeague(draft)
```

- [ ] **Step 2: Replace the look-up in `NameStep.tsx`**

Change the React import to `import { useState } from 'react'`.

Delete the `server` state, its comment, the `slug` line and the whole `useEffect`. In their place:

```ts
  const base = generateSlug(draft.name)
  // The server rejects a name with no letters or digits, so stop it here, not two steps later.
  const canContinue = base !== ''
  const slug = base && `${base}-${draft.code}`
```

(Keep only one `canContinue`: remove the old declaration and its comment.) The JSX that prints `{slug}` stays as it is.

- [ ] **Step 3: Check and commit**

Run: `npx tsc --noEmit && npx eslint components/new-league && npm test -- __tests__/api-games.test.ts`
Expected: no type errors, no lint errors, tests PASS.

Run: `grep -rn "api/games/slug" app components lib`
Expected: no output.

```bash
git add components/new-league/NewLeagueWizard.tsx components/new-league/NameStep.tsx
git commit -m "Name step: preview the address from the draft's code, drop the look-up

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 3: `useSessionState`

**Files:**
- Create: `components/new-league/useSessionState.ts`
- Test: `__tests__/use-session-state.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/use-session-state.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { useSessionState } from '@/components/new-league/useSessionState'

beforeEach(() => sessionStorage.clear())

describe('useSessionState', () => {
  it('starts from the initial value and stores nothing until it is set', () => {
    const { result } = renderHook(() => useSessionState('k', { n: 1 }))
    expect(result.current[0]).toEqual({ n: 1 })
    expect(result.current[2].loaded).toBe(true)
    expect(sessionStorage.getItem('k')).toBeNull()
  })

  it('restores a stored value', () => {
    sessionStorage.setItem('k', JSON.stringify({ n: 5 }))
    const { result } = renderHook(() => useSessionState('k', { n: 1 }))
    expect(result.current[0]).toEqual({ n: 5 })
  })

  it('writes every change made through the setter', () => {
    const { result } = renderHook(() => useSessionState('k', { n: 1 }))
    act(() => result.current[1]((v) => ({ n: v.n + 1 })))
    expect(result.current[0]).toEqual({ n: 2 })
    expect(JSON.parse(sessionStorage.getItem('k')!)).toEqual({ n: 2 })
  })

  it('clear removes the key and keeps the value in memory', () => {
    const { result } = renderHook(() => useSessionState('k', { n: 1 }))
    act(() => result.current[1]({ n: 2 }))
    act(() => result.current[2].clear())
    expect(sessionStorage.getItem('k')).toBeNull()
    expect(result.current[0]).toEqual({ n: 2 })
  })

  it('falls back to the initial value when the stored JSON is corrupt', () => {
    sessionStorage.setItem('k', '{not json')
    const { result } = renderHook(() => useSessionState('k', { n: 1 }))
    expect(result.current[0]).toEqual({ n: 1 })
    expect(result.current[2].loaded).toBe(true)
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `npm test -- __tests__/use-session-state.test.tsx`
Expected: FAIL, cannot find module `@/components/new-league/useSessionState`.

- [ ] **Step 3: Write the hook**

Create `components/new-league/useSessionState.ts`:

```ts
// components/new-league/useSessionState.ts
'use client'

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

/** sessionStorage keys for league-setup answers not yet saved to the database. */
export const DRAFT_KEY = 'new-league:draft'
export const rosterKey = (slug: string) => `new-league:roster:${slug}`
export const resultsKey = (slug: string) => `new-league:results:${slug}`

/**
 * useState mirrored to the tab's sessionStorage, so a refresh or the Back
 * button keeps what was typed. The first render uses `initial` (the server
 * has no storage); an effect then swaps in the stored value and sets
 * `loaded`. Only changes made through the setter are stored, so a page that
 * is merely visited never shadows newer server data. Storage that throws is
 * ignored and this behaves as plain useState.
 */
export function useSessionState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState(initial)
  const [loaded, setLoaded] = useState(false)
  const dirty = useRef(false)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key)
      if (raw !== null) setValue(JSON.parse(raw) as T)
    } catch {
      // unreadable or corrupt: carry on from `initial`
    }
    setLoaded(true)
  }, [key])

  useEffect(() => {
    if (!dirty.current) return
    try {
      sessionStorage.setItem(key, JSON.stringify(value))
    } catch {
      // private mode or quota: the value still lives in memory
    }
  }, [key, value])

  const set: Dispatch<SetStateAction<T>> = useCallback((action) => {
    dirty.current = true
    setValue(action)
  }, [])

  const clear = useCallback(() => {
    dirty.current = false
    try {
      sessionStorage.removeItem(key)
    } catch {
      // nothing stored, nothing to remove
    }
  }, [key])

  return [value, set, { loaded, clear }] as const
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npm test -- __tests__/use-session-state.test.tsx`
Expected: PASS, 5 tests.

If ESLint's `react-hooks/set-state-in-effect` rule flags the load effect (`npx eslint components/new-league/useSessionState.ts`), keep the effect and add `// eslint-disable-next-line react-hooks/set-state-in-effect -- storage can only be read after hydration` above each flagged `setValue` / `setLoaded` call.

- [ ] **Step 5: Commit**

```bash
git add components/new-league/useSessionState.ts __tests__/use-session-state.test.tsx
git commit -m "Add useSessionState: useState mirrored to the tab's sessionStorage

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 4: Name, Where and When keep their answers and edit the league once it exists

**Files:**
- Modify: `components/new-league/NewLeagueWizard.tsx`
- Modify: `components/new-league/NameStep.tsx`
- Modify: `components/new-league/WhenStep.tsx:13-19,35,64-65`
- Modify: `components/new-league/LiveShareCard.tsx`
- Test: `__tests__/new-league-wizard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/new-league-wizard.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NewLeagueWizard } from '@/components/new-league/NewLeagueWizard'
import { DRAFT_KEY } from '@/components/new-league/useSessionState'

const push = jest.fn()
const replace = jest.fn()
let pathname = '/new/when'
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, refresh: jest.fn() }),
  usePathname: () => pathname,
}))

const DRAFT = { name: 'Hackney Thursdays', bio: '', location: 'Mabley Green', day: 'Thursday', time: '20:00', code: 'k7x' }
const CREATED = { ...DRAFT, created: { id: 'g1', slug: 'hackney-thursdays-k7x' } }
const fetchMock = jest.fn()

function respond(status: number, body: unknown = {}) {
  return Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) })
}

beforeEach(() => {
  jest.resetAllMocks()
  sessionStorage.clear()
  pathname = '/new/when'
  global.fetch = fetchMock as unknown as typeof fetch
})

describe('NewLeagueWizard', () => {
  it('stays on When after a refresh when the draft is stored', async () => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(DRAFT))
    render(<NewLeagueWizard stepOffset={0} />)
    expect(await screen.findByRole('heading', { name: 'When do you play?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create league' })).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('goes back to Name on a hard load of When with nothing stored', async () => {
    render(<NewLeagueWizard stepOffset={0} />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/new/name'))
  })

  it('creates the league, remembers it and moves to Who plays', async () => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(DRAFT))
    fetchMock.mockReturnValue(respond(200, { id: 'g1', slug: 'hackney-thursdays-k7x' }))
    render(<NewLeagueWizard stepOffset={0} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Create league' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/new/hackney-thursdays-k7x/players'))
    expect(fetchMock).toHaveBeenCalledWith('/api/games', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)!).created).toEqual({ id: 'g1', slug: 'hackney-thursdays-k7x' })
  })

  it('updates the existing league instead of creating a second one', async () => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(CREATED))
    fetchMock.mockReturnValue(respond(200, { ok: true, slug: 'hackney-thursdays-k7x' }))
    render(<NewLeagueWizard stepOffset={0} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/new/hackney-thursdays-k7x/players'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/league/g1/details')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ name: 'Hackney Thursdays', bio: '', location: 'Mabley Green', day: 'Thursday', kickoff_time: '20:00' })
  })

  it('falls back to creating when the league is gone', async () => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(CREATED))
    fetchMock.mockReturnValue(respond(404, { error: 'Not found' }))
    render(<NewLeagueWizard stepOffset={0} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('button', { name: 'Create league' })).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('shows the fixed address on Name once the league exists', async () => {
    pathname = '/new/name'
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...CREATED, name: 'Renamed League' }))
    render(<NewLeagueWizard stepOffset={0} />)
    expect(await screen.findByText('hackney-thursdays-k7x')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `npm test -- __tests__/new-league-wizard.test.tsx`
Expected: FAIL. The first test finds the Name heading instead of When, and `replace` is called.

- [ ] **Step 3: Rewrite `NewLeagueWizard.tsx`**

Replace the whole file with:

```tsx
// components/new-league/NewLeagueWizard.tsx
'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { slugCode } from '@/lib/utils'
import { NameStep } from './NameStep'
import { WhereStep } from './WhereStep'
import { WhenStep } from './WhenStep'
import { DRAFT_KEY, useSessionState } from './useSessionState'

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
  /** The address suffix, picked once so the Name step's preview is the real address. */
  code: string
  /** Set once the league exists. From then on these steps edit it and never create another. */
  created?: { id: string; slug: string }
}

const EMPTY: LeagueDraft = { name: '', bio: '', location: '', day: 'Thursday', time: '20:00', code: '' }

function stepFromPath(pathname: string): Step {
  const last = pathname.split('/').pop() ?? ''
  return (STEPS as readonly string[]).includes(last) ? (last as Step) : 'name'
}

function send(url: string, method: 'POST' | 'PATCH', body: unknown) {
  return fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

interface Props {
  stepOffset: number
}

/**
 * Name, Where and When. The answers live in the tab's sessionStorage, so a
 * refresh or Back keeps them; each step gets its own URL through pushState,
 * which Next syncs to usePathname. Before the league exists, When creates it.
 * Afterwards (Back from Who plays) the same steps update it.
 */
export function NewLeagueWizard({ stepOffset }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [draft, setDraft, { loaded }] = useSessionState<LeagueDraft>(DRAFT_KEY, EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A hard load of a later step with nothing stored has nothing to continue
  // from: show Name and move the URL back through the router.
  const step = draft.name ? stepFromPath(pathname) : 'name'
  useEffect(() => {
    if (loaded && pathname !== '/new/name' && pathname !== '/new' && !draft.name) router.replace('/new/name')
  }, [loaded, pathname, draft.name, router])

  const go = (next: Step) => window.history.pushState(null, '', `/new/${next}`)
  const update = (patch: Partial<LeagueDraft>) => setDraft((d) => ({ ...d, ...patch, code: d.code || slugCode() }))

  async function submit() {
    const { created } = draft
    const verb = created ? 'save' : 'create'
    setSubmitting(true)
    setError(null)
    const details = { name: draft.name, bio: draft.bio, location: draft.location, day: draft.day, kickoff_time: draft.time }
    let res: Response
    try {
      res = created
        ? await send(`/api/league/${created.id}/details`, 'PATCH', details)
        : await send('/api/games', 'POST', { ...details, code: draft.code })
    } catch {
      setError(`Could not ${verb} the league. Check your connection and try again.`)
      setSubmitting(false)
      return
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      // The league was deleted, or someone else is signed in on this tab: the next press creates a new one.
      if (created && (res.status === 403 || res.status === 404)) setDraft((d) => ({ ...d, created: undefined }))
      // Only validation messages are written for people; anything else gets the generic line.
      setError(res.status === 400 && typeof data.error === 'string' ? data.error : `Could not ${verb} the league. Try again.`)
      setSubmitting(false)
      return
    }
    const slug = created?.slug ?? (data.slug as string)
    if (!created) setDraft((d) => ({ ...d, created: { id: data.id as string, slug } }))
    router.push(`/new/${slug}/players`)
  }

  // A refresh on Where or When: wait for the stored draft rather than flash Name.
  if (!loaded && stepFromPath(pathname) !== 'name') return null
  if (step === 'where') return <WhereStep stepOffset={stepOffset} draft={draft} onChange={update} onNext={() => go('when')} />
  if (step === 'when') return <WhenStep stepOffset={stepOffset} draft={draft} onChange={update} onSubmit={submit} submitting={submitting} editing={!!draft.created} error={error} />
  return <NameStep stepOffset={stepOffset} draft={draft} onChange={update} onNext={() => go('where')} />
}
```

- [ ] **Step 4: `WhenStep.tsx`: the button label**

In `Props`, after `submitting: boolean`:

```ts
  /** The league already exists: this step saves changes to it. */
  editing: boolean
```

Add `editing` to the destructured props on the `export function WhenStep(` line.

Replace the button's label expression:

```tsx
            {submitting ? (editing ? 'Saving…' : 'Creating…') : editing ? 'Continue' : 'Create league'}
```

- [ ] **Step 5: `NameStep.tsx`: the fixed address**

Change the `slug` line added in Task 2 to:

```ts
  // Once the league exists its address is fixed, whatever the name becomes.
  const slug = draft.created?.slug ?? (base && `${base}-${draft.code}`)
```

- [ ] **Step 6: `LiveShareCard.tsx`: finish the draft**

Change the React import to `import { useEffect, useState } from 'react'` and add:

```ts
import { DRAFT_KEY } from './useSessionState'
```

Inside `LiveShareCard`, directly after the `useState` line:

```ts
  // Setup is finished: the next visit to /new starts a new league, not this one.
  useEffect(() => {
    try {
      sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      // storage unavailable: nothing was stored either
    }
  }, [])
```

- [ ] **Step 7: Run the tests**

Run: `npm test -- __tests__/new-league-wizard.test.tsx`
Expected: PASS, 6 tests.

Run: `npx tsc --noEmit && npx eslint components/new-league __tests__/new-league-wizard.test.tsx`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add components/new-league/NewLeagueWizard.tsx components/new-league/NameStep.tsx components/new-league/WhenStep.tsx components/new-league/LiveShareCard.tsx __tests__/new-league-wizard.test.tsx
git commit -m "Setup wizard: keep Name, Where and When across refresh, and edit the league once it exists

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 5: `rosterRenames`

**Files:**
- Modify: `lib/playerUtils.ts` (append)
- Test: `lib/__tests__/playerUtils.rosterRenames.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/playerUtils.rosterRenames.test.ts`:

```ts
import { rosterRenames } from '@/lib/playerUtils'

const row = (id: string, name: string) => ({ id, name })

describe('rosterRenames', () => {
  it('returns saved rows whose name has changed', () => {
    expect(rosterRenames(['Will L', 'Bob'], [row('Will L', 'Will L'), row('Bob', 'Bobby')])).toEqual([row('Bob', 'Bobby')])
  })

  it('ignores surrounding whitespace', () => {
    expect(rosterRenames(['Bob'], [row('Bob', ' Bob ')])).toEqual([])
  })

  it('ignores rows that were never saved', () => {
    expect(rosterRenames(['Bob'], [row('Bob', 'Bob'), row('3f2a', 'Carl')])).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `npm test -- lib/__tests__/playerUtils.rosterRenames.test.ts`
Expected: FAIL, `rosterRenames` is not exported.

- [ ] **Step 3: Implement**

Append to `lib/playerUtils.ts`:

```ts
/**
 * Setup-wizard rows that rename a player the league already holds. A row
 * seeded from the server keeps the saved name as its id, so a different
 * (trimmed) name on that row is a rename.
 */
export function rosterRenames<T extends { id: string; name: string }>(saved: string[], players: T[]): T[] {
  return players.filter((p) => saved.includes(p.id) && p.name.trim() !== p.id)
}
```

- [ ] **Step 4: Run it and see it pass, then commit**

Run: `npm test -- lib/__tests__/playerUtils.rosterRenames.test.ts`
Expected: PASS, 3 tests.

```bash
git add lib/playerUtils.ts lib/__tests__/playerUtils.rosterRenames.test.ts
git commit -m "Add rosterRenames: setup rows that rename a saved player

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 6: Roster steps keep their list, and removals and renames stick

**Files:**
- Modify: `components/new-league/RosterWizard.tsx`
- Test: `__tests__/roster-wizard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/roster-wizard.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RosterWizard, type RosterPlayer } from '@/components/new-league/RosterWizard'
import { rosterKey } from '@/components/new-league/useSessionState'

const push = jest.fn()
const replace = jest.fn()
const refresh = jest.fn()
let pathname = '/new/hackney/strength'
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, refresh }),
  usePathname: () => pathname,
}))

const player = (name: string, extra: Partial<RosterPlayer> = {}): RosterPlayer => ({ id: name, name, mentality: 'balanced', strength: 'average', ...extra })
const INITIAL = [player('Will L', { you: true }), player('Bob'), player('Carl')]
const fetchMock = jest.fn()

function respond(status: number, body: unknown = {}) {
  return Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) })
}

function mount() {
  return render(<RosterWizard leagueId="g1" slug="hackney" initial={INITIAL} stepOffset={0} />)
}

beforeEach(() => {
  jest.resetAllMocks()
  sessionStorage.clear()
  pathname = '/new/hackney/strength'
  global.fetch = fetchMock as unknown as typeof fetch
  fetchMock.mockImplementation(() => respond(200, { ok: true }))
})

describe('RosterWizard', () => {
  it('restores a stored list after a refresh on Strength', async () => {
    sessionStorage.setItem(rosterKey('hackney'), JSON.stringify({ players: [...INITIAL, player('Dan', { id: 'new-1' })], removed: [] }))
    mount()
    expect(await screen.findByText('Dan')).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('deletes removed players, then renames, then upserts the list', async () => {
    sessionStorage.setItem(
      rosterKey('hackney'),
      JSON.stringify({ players: [INITIAL[0], { ...INITIAL[1], name: 'Bobby' }, player('Dan', { id: 'new-1' })], removed: ['Carl'] }),
    )
    mount()
    await screen.findByText('Bobby')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/new/hackney/results'))

    expect(fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      'DELETE /api/league/g1/players/Carl',
      'PATCH /api/league/g1/players/Bob/rename',
      'PUT /api/league/g1/roster',
    ])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ new_name: 'Bobby' })
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).players.map((p: { name: string }) => p.name)).toEqual(['Will L', 'Bobby', 'Dan'])
    expect(sessionStorage.getItem(rosterKey('hackney'))).toBeNull()
  })

  it('treats a delete that finds nobody as done', async () => {
    sessionStorage.setItem(rosterKey('hackney'), JSON.stringify({ players: [INITIAL[0], INITIAL[1]], removed: ['Carl'] }))
    fetchMock.mockImplementation((_url: string, init: { method: string }) => respond(init.method === 'DELETE' ? 404 : 200))
    mount()
    await screen.findByText('Bob')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/new/hackney/results'))
  })

  it('keeps the stored list and reloads the saved one when a call fails', async () => {
    const stored = JSON.stringify({ players: [INITIAL[0], { ...INITIAL[1], name: 'Bobby' }], removed: [] })
    sessionStorage.setItem(rosterKey('hackney'), stored)
    fetchMock.mockImplementation((_url: string, init: { method: string }) => respond(init.method === 'PATCH' ? 409 : 200))
    mount()
    await screen.findByText('Bobby')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Bobby is already on the list')
    expect(push).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `npm test -- __tests__/roster-wizard.test.tsx`
Expected: FAIL. `Dan` and `Bobby` are never found because the stored list is ignored.

- [ ] **Step 3: Rewrite `RosterWizard.tsx`**

Replace the whole file with:

```tsx
// components/new-league/RosterWizard.tsx
'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { Mentality, Strength } from '@/lib/types'
import { rosterRenames } from '@/lib/playerUtils'
import { PlayersStep } from './PlayersStep'
import { MentalityStep } from './MentalityStep'
import { StrengthStep } from './StrengthStep'
import { rosterKey, useSessionState } from './useSessionState'

const STEPS = ['players', 'mentality', 'strength'] as const
type Step = (typeof STEPS)[number]

export interface RosterPlayer {
  /** The saved name for a player the league already holds; a UUID for a new row. */
  id: string
  name: string
  /** The creator: fixed first, not removable. */
  you?: boolean
  mentality: Mentality
  strength: Strength
}

interface RosterDraft {
  players: RosterPlayer[]
  /** Saved players taken off the list. Deleted on save; recorded, never inferred from a missing row. */
  removed: string[]
}

interface Props {
  leagueId: string
  slug: string
  /** The roster as saved so far: the creator first, then anyone already written. */
  initial: RosterPlayer[]
  stepOffset: number
}

function stepFromPath(pathname: string): Step {
  const last = pathname.split('/').pop() ?? ''
  return (STEPS as readonly string[]).includes(last) ? (last as Step) : 'players'
}

const newPlayer = (name: string): RosterPlayer => ({ id: crypto.randomUUID(), name, mentality: 'balanced', strength: 'average' })
const isNamed = (p: RosterPlayer) => p.name.trim() !== ''
const GENERIC = 'Could not save the roster. Try again.'

/**
 * Who plays, Mentality and Strength. The list lives in the tab's
 * sessionStorage until it is written at the end of Strength, so a refresh or
 * Back keeps it. It always ends in a blank row to type into; blank rows never
 * leave this component. Step URLs change through pushState like the
 * pre-creation wizard; a hard load with only the creator goes back to players.
 */
export function RosterWizard({ leagueId, slug, initial, stepOffset }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [roster, setRoster, { loaded, clear }] = useSessionState<RosterDraft>(rosterKey(slug), () => ({ players: [...initial, newPlayer('')], removed: [] }))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { players } = roster
  const named = players.filter(isNamed)
  // Names the league already holds; a server-seeded row's id is its saved name.
  const saved = initial.map((p) => p.id)
  const step = named.length < 2 ? 'players' : stepFromPath(pathname)

  useEffect(() => {
    if (loaded && named.length < 2 && stepFromPath(pathname) !== 'players') router.replace(`/new/${slug}/players`)
  }, [loaded, pathname, named.length, router, slug])

  const go = (next: Step) => window.history.pushState(null, '', `/new/${slug}/${next}`)
  const setPlayers = (change: (ps: RosterPlayer[]) => RosterPlayer[]) => setRoster((r) => ({ ...r, players: change(r.players) }))
  const patch = (id: string, change: Partial<RosterPlayer>) => setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, ...change } : p)))

  async function save() {
    setSubmitting(true)
    setError(null)
    const fail = (message = GENERIC) => {
      setError(message)
      setSubmitting(false)
      // Some edits may have landed: reload the saved list so a retry applies only what is left.
      router.refresh()
    }
    const api = `/api/league/${leagueId}`
    const names = named.map((p) => p.name.trim())
    try {
      // Deletes first, so a rename can take a removed player's name. A name back on the list is kept.
      for (const name of roster.removed.filter((n) => saved.includes(n) && !names.includes(n))) {
        const res = await fetch(`${api}/players/${encodeURIComponent(name)}`, { method: 'DELETE' })
        if (!res.ok && res.status !== 404) return fail()
      }
      for (const p of rosterRenames(saved, named)) {
        const name = p.name.trim()
        const res = await fetch(`${api}/players/${encodeURIComponent(p.id)}/rename`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_name: name }),
        })
        if (!res.ok) return fail(res.status === 409 ? `${name} is already on the list` : GENERIC)
        // The row now stands for the renamed player, so a retry does not rename again.
        patch(p.id, { id: name })
      }
      const res = await fetch(`${api}/roster`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players: named.map(({ name, strength, mentality }) => ({ name, strength, mentality })) }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return fail(res.status === 400 && typeof data.error === 'string' ? data.error : GENERIC)
      }
    } catch {
      return fail('Could not save the roster. Check your connection and try again.')
    }
    clear()
    // Back from Live reuses this page from the client cache, which still holds
    // the pre-save roster; refresh drops that entry so Back re-reads the saved list.
    router.refresh()
    router.push(`/new/${slug}/results`)
  }

  // A refresh on Mentality or Strength: wait for the stored list rather than flash Who plays.
  if (!loaded && stepFromPath(pathname) !== 'players') return null
  if (step === 'mentality') {
    return <MentalityStep stepOffset={stepOffset} players={named} onChange={(id, mentality) => patch(id, { mentality })} onNext={() => go('strength')} />
  }
  if (step === 'strength') {
    return <StrengthStep stepOffset={stepOffset} players={named} onChange={(id, strength) => patch(id, { strength })} onSubmit={save} submitting={submitting} error={error} />
  }
  return (
    <PlayersStep
      stepOffset={stepOffset}
      players={players}
      onAdd={(added) => setPlayers((ps) => [...ps.filter(isNamed), ...added.map(newPlayer), ...ps.filter((p) => !isNamed(p))])}
      onAddBlank={() => setPlayers((ps) => [...ps, newPlayer('')])}
      onRename={(id, name) => patch(id, { name })}
      onRemove={(id) => setRoster((r) => ({ players: r.players.filter((p) => p.id !== id), removed: saved.includes(id) ? [...r.removed, id] : r.removed }))}
      onNext={() => go('mentality')}
    />
  )
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- __tests__/roster-wizard.test.tsx __tests__/roster-route.test.ts`
Expected: PASS.

If the `Continue` button query matches more than one element, the Strength step has a second button with that name; use `screen.getAllByRole('button', { name: 'Continue' })[0]` only after confirming in `StrengthStep.tsx` which is the primary one.

Run: `npx tsc --noEmit && npx eslint components/new-league __tests__/roster-wizard.test.tsx`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/new-league/RosterWizard.tsx __tests__/roster-wizard.test.tsx
git commit -m "Roster steps: keep the list across refresh, apply removals and renames of saved players on save

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 7: Results step keeps unimported games

**Files:**
- Modify: `components/new-league/ResultsStep.tsx:3,33,74-76`

No new test: the change is two lines on top of the hook Task 3 already tests.

- [ ] **Step 1: Swap the state**

Add the import:

```ts
import { resultsKey, useSessionState } from './useSessionState'
```

Replace

```ts
  const [games, setGames] = useState<DraftGame[]>([])
```

with

```ts
  // Unimported games survive a refresh; the stored list goes once they are imported.
  const [games, setGames, { clear }] = useSessionState<DraftGame[]>(resultsKey(slug), [])
```

`useState` is still used by the other state in this file, so its import stays.

- [ ] **Step 2: Clear after a successful import**

In `importAll`, directly before `router.refresh()`:

```ts
    clear()
```

- [ ] **Step 3: Check and commit**

Run: `npx tsc --noEmit && npx eslint components/new-league/ResultsStep.tsx && npm test -- __tests__`
Expected: clean, all suites PASS.

```bash
git add components/new-league/ResultsStep.tsx
git commit -m "Results step: keep unimported games across a refresh

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 8: Verify and open the PR

- [ ] **Step 1: Whole suite, types, lint**

Run: `npm test`
Expected: every suite passes. One suite was removed (`slug.reserved`) and four added.

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 2: Build and bundle**

Run: `npm run build && npm run bundle-report`
Expected: build succeeds. Note the gzipped size of the `/new/[[...step]]` route and the shared baseline (must stay under 80 kB). The hook is under 1 kB; a jump of more than 2 kB on `/new` means something was imported statically that should not be.

- [ ] **Step 3: Update `CLAUDE.md` only if it names something removed**

Run: `grep -n "resolveUniqueSlug\|lib/slug\|api/games/slug" CLAUDE.md docs/*.md`
Expected: no output. If there is any, remove or reword those lines.

- [ ] **Step 4: Push and open the PR against the slice 5 branch**

```bash
git push -u origin awmloveland/league-creation-step-saving
gh pr create --base awmloveland/league-creation-polish --title "League creation: address codes and answers that survive Back and refresh" --body "$(cat <<'EOF'
## What changed
- **Address:** a new league's address is its name plus a three-character code (`thursday-fives-k7x`). Two leagues can share a name and nobody becomes "2". Existing addresses are untouched. The slug look-up route and `lib/slug.ts` are gone; the unique constraint is the check, with one retry.
- **Answers persist:** the league draft, the roster list and unimported games are mirrored to the tab's sessionStorage through one hook, `useSessionState`.
- **Back edits, never re-creates:** once the league exists, Name, Where and When update it through the details route.
- **Roster edits stick:** removing or renaming an already-saved player is applied on save through the existing delete and rename routes.

## Deploy notes
No migration. Nothing to run in Supabase.

## Manual pass (signed in, dev server)
1. Start `/new`, type a name: the address under the field ends in a three-character code and does not change as you edit the name.
2. Refresh on Where and on When: you stay on the step with answers in place.
3. Create the league, press Back from Who plays: When shows your answers and the button reads Continue. Go back to Name, change the name, go forward through Continue: you land on Who plays for the same league (check `select slug, name from games order by created_at desc limit 3;` shows one row, renamed).
4. Add four players, refresh on Mentality: the list is intact. Finish Strength.
5. On Results add two games without importing and refresh: both are still listed. Import.
6. From Live press Back to Who plays, remove one player and rename another, finish Strength again: Settings → Players shows the removal and the rename.
7. Delete the test league.

Specs: `docs/superpowers/specs/2026-11-13-league-address-code-design.md`, `docs/superpowers/specs/2026-11-13-league-creation-step-saving-design.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Report**

Give the user the PR link, the test count, the `/new` bundle size, and the manual pass above. Say plainly that none of the browser behaviour was clicked through, because local dev writes to the production database and sign-in needs a code from the user's inbox.
