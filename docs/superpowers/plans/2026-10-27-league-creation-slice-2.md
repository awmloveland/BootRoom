# League creation, slice 2: roster steps — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After creating a league, the admin adds players by name, sets each one's mentality and strength, and the roster is written in one call before the Live screen.

**Architecture:** The `/new` page dispatches `/new/[slug]/players|mentality|strength` to a server `RosterScreen` that loads the league and the viewer's player name, then renders a client `RosterWizard` holding the roster across the three `pushState` URLs. A new `PUT /api/league/[id]/roster` validates the batch and makes one `promote_roster` call.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, Supabase RPC, Jest.

**Spec:** `docs/superpowers/specs/2026-10-27-league-creation-slice-2-design.md`. **Branch:** `awmloveland/league-creation-roster`, stacked on `awmloveland/craft-football-onboarding` (PR #194). The PR targets that branch.

---

## File map

| File | Responsibility |
|---|---|
| `lib/playerUtils.ts` | `splitPastedNames` |
| `lib/__tests__/playerUtils.splitPastedNames.test.ts` | Its tests |
| `app/api/league/[id]/roster/route.ts` | `PUT`: batch roster upsert |
| `__tests__/roster-route.test.ts` | Route tests |
| `components/ui/MentalityControl.tsx`, `components/ui/StrengthPills.tsx` | `size="lg"` |
| `components/new-league/StepShell.tsx` | `STEP_COUNT = 6` |
| `components/new-league/NewLeagueWizard.tsx` | Route to players after create |
| `components/new-league/RosterScreen.tsx` | Server: loads league, viewer's player, roster names |
| `components/new-league/RosterWizard.tsx` | Client: roster state, step URLs, save |
| `components/new-league/PlayersStep.tsx`, `MentalityStep.tsx`, `StrengthStep.tsx` | One screen each |
| `components/new-league/PlayerRow.tsx` | Shared row frame with the YOU badge |
| `app/new/[[...step]]/page.tsx` | Dispatch the three roster steps |

---

### Task 1: `splitPastedNames`

**Files:**
- Modify: `lib/playerUtils.ts` (append)
- Create: `lib/__tests__/playerUtils.splitPastedNames.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/playerUtils.splitPastedNames.test.ts
import { splitPastedNames } from '@/lib/playerUtils'

describe('splitPastedNames', () => {
  it('splits on newlines, commas, ampersands, slashes and the word and', () => {
    expect(splitPastedNames('Alice, Bob & Carl / Dan and Eve\nFrank')).toEqual(['Alice', 'Bob', 'Carl', 'Dan', 'Eve', 'Frank'])
  })

  it('treats and as a separator only as a whole word', () => {
    expect(splitPastedNames('Andy and Sandra')).toEqual(['Andy', 'Sandra'])
    expect(splitPastedNames('Andrea Brand')).toEqual(['Andrea Brand'])
  })

  it('trims, drops blanks and de-duplicates case-insensitively keeping the first spelling', () => {
    expect(splitPastedNames('  alice ,, Alice,\n\n bob ')).toEqual(['alice', 'bob'])
  })

  it('returns an empty list for empty input', () => {
    expect(splitPastedNames('   ')).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- lib/__tests__/playerUtils.splitPastedNames.test.ts`
Expected: FAIL, `splitPastedNames` is not exported.

- [ ] **Step 3: Implement**

Append to `lib/playerUtils.ts`:

```ts
/**
 * Names pasted into the league setup roster: one per line, or separated by
 * commas, `&`, `/` or the word "and". Trimmed, blanks dropped, duplicates
 * removed case-insensitively keeping the first spelling.
 */
export function splitPastedNames(text: string): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const part of text.split(/\r?\n|,|&|\/|\band\b/i)) {
    const name = part.trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  return names
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- lib/__tests__/playerUtils.splitPastedNames.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/playerUtils.ts lib/__tests__/playerUtils.splitPastedNames.test.ts
git commit -m "Add splitPastedNames for the roster paste box

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `PUT /api/league/[id]/roster`

**Files:**
- Create: `app/api/league/[id]/roster/route.ts`
- Create: `__tests__/roster-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/roster-route.test.ts
import { createClient } from '@/lib/supabase/server'
import { mockAuthNamespace } from '@/lib/__tests__/helpers/supabase-auth'
import { revalidateTag } from 'next/cache'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }))

import { PUT } from '@/app/api/league/[id]/roster/route'

const LEAGUE = 'g1'
const USER = { id: 'u1', email: 'a@example.com' }
const rpc = jest.fn()

function setup(user: typeof USER | null, isAdmin = true) {
  rpc.mockImplementation((name: string) =>
    Promise.resolve(name === 'is_game_admin' ? { data: isAdmin, error: null } : { data: null, error: null }),
  )
  ;(createClient as jest.Mock).mockResolvedValue({ auth: mockAuthNamespace(user), rpc })
}

function put(body: unknown) {
  return PUT(
    new Request('http://localhost/api', { method: 'PUT', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: LEAGUE }) },
  )
}

const ALICE = { name: 'Alice', strength: 'above', mentality: 'attacking' }
const BOB = { name: ' Bob ', strength: 'average', mentality: 'goalkeeper' }

beforeEach(() => jest.resetAllMocks())

describe('PUT /api/league/[id]/roster', () => {
  it('returns 401 when signed out', async () => {
    setup(null)
    expect((await put({ players: [ALICE] })).status).toBe(401)
  })

  it('returns 403 for a non-admin', async () => {
    setup(USER, false)
    expect((await put({ players: [ALICE] })).status).toBe(403)
    expect(rpc).not.toHaveBeenCalledWith('promote_roster', expect.anything())
  })

  it.each([
    ['no list', {}],
    ['an empty list', { players: [] }],
    ['a bad entry', { players: [{ name: 'X', strength: 'huge', mentality: 'balanced' }] }],
    ['a duplicate name', { players: [ALICE, { ...ALICE, name: 'alice' }] }],
  ])('returns 400 for %s', async (_label, body) => {
    setup(USER)
    expect((await put(body)).status).toBe(400)
    expect(rpc).not.toHaveBeenCalledWith('promote_roster', expect.anything())
  })

  it('upserts the batch in one promote_roster call and revalidates', async () => {
    setup(USER)
    const res = await put({ players: [ALICE, BOB] })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, count: 2 })
    expect(rpc).toHaveBeenCalledWith('promote_roster', {
      p_game_id: LEAGUE,
      p_entries: [
        { name: 'Alice', rating: 3, mentality: 'attacking', goalkeeper: false },
        { name: 'Bob', rating: 2, mentality: 'goalkeeper', goalkeeper: true },
      ],
    })
    expect(revalidateTag).toHaveBeenCalledWith('league:g1', expect.anything())
  })

  it('maps an RPC error through rpcErrorStatus', async () => {
    setup(USER)
    rpc.mockImplementation((name: string) =>
      Promise.resolve(name === 'is_game_admin' ? { data: true, error: null } : { data: null, error: { message: 'Access denied' } }),
    )
    expect((await put({ players: [ALICE] })).status).toBe(403)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- __tests__/roster-route.test.ts`
Expected: FAIL, cannot find module `@/app/api/league/[id]/roster/route`.

- [ ] **Step 3: Write the route**

```ts
// app/api/league/[id]/roster/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin, rpcErrorStatus } from '@/lib/apiAuth'
import { revalidateLeague } from '@/lib/leagueCache'
import { strengthToRating } from '@/lib/strength'
import { parseAddPlayerBody, type AddPlayerInput } from '@/lib/playerUtils'

const MAX_PLAYERS = 60

/**
 * PUT — admin only. Writes the league setup roster in one promote_roster
 * call, which upserts by name (so the creator's existing row is updated).
 * Body: { players: [{ name, strength, mentality }] }, 1 to 60 entries.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireLeagueAdmin(id)
  if ('response' in gate) return gate.response

  const body = (await req.json().catch(() => null)) as { players?: unknown } | null
  const raw = Array.isArray(body?.players) ? body.players : null
  if (!raw || raw.length === 0 || raw.length > MAX_PLAYERS) {
    return NextResponse.json({ error: `Send between 1 and ${MAX_PLAYERS} players` }, { status: 400 })
  }
  const players: AddPlayerInput[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    const player = parseAddPlayerBody(entry)
    if (!player) return NextResponse.json({ error: 'Invalid player' }, { status: 400 })
    const key = player.name.toLowerCase()
    if (seen.has(key)) return NextResponse.json({ error: `${player.name} is listed twice` }, { status: 400 })
    seen.add(key)
    players.push(player)
  }

  // shortcut: no case-insensitive check against rows already in player_attributes, fine while
  // the setup wizard is the only caller and the league is new; add the ilike check from POST
  // /players if this is ever reused for an established roster
  const supabase = await createClient()
  const { error } = await supabase.rpc('promote_roster', {
    p_game_id: id,
    p_entries: players.map((p) => ({
      name: p.name,
      rating: strengthToRating(p.strength),
      mentality: p.mentality,
      goalkeeper: p.mentality === 'goalkeeper',
    })),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: rpcErrorStatus(error.message) })

  revalidateLeague(id)
  return NextResponse.json({ ok: true, count: players.length })
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- __tests__/roster-route.test.ts`
Expected: PASS, 8 tests. (The tag string `league:g1` comes from `leagueTag` in `lib/leagueCache.ts`; if it differs, match it exactly.)

- [ ] **Step 5: Commit**

```bash
git add app/api/league/\[id\]/roster __tests__/roster-route.test.ts
git commit -m "Add PUT /api/league/[id]/roster for the setup batch write

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `size="lg"` on the two controls

**Files:**
- Modify: `components/ui/MentalityControl.tsx`
- Modify: `components/ui/StrengthPills.tsx`

- [ ] **Step 1: MentalityControl**

Change the props and class logic to:

```tsx
interface Props {
  value: Mentality
  onChange: (m: Mentality) => void
  fullWidth?: boolean
  disabled?: boolean
  /** `lg` is the league setup size: 46px segments, 38px tall. */
  size?: 'sm' | 'lg'
}

export function MentalityControl({ value, onChange, fullWidth = false, disabled = false, size = 'sm' }: Props) {
  const lg = size === 'lg'
  return (
    <div
      className={cn(
        'flex border border-[#223a5c] overflow-hidden font-plex font-bold uppercase',
        lg ? 'rounded-md text-[9px] tracking-[.1em]' : 'rounded text-[9px] tracking-[.12em]',
        fullWidth && 'w-full'
      )}
    >
      {OPTIONS.map(({ value: v, label }, i) => (
        <button
          key={v}
          type="button"
          aria-pressed={v === value}
          disabled={disabled}
          onClick={() => { if (!disabled && v !== value) onChange(v) }}
          className={cn(
            'transition-colors border-[#223a5c] disabled:opacity-50 disabled:cursor-not-allowed',
            lg ? 'w-[46px] h-[38px]' : fullWidth ? 'flex-1 h-8' : 'h-6 px-2',
            i < OPTIONS.length - 1 && 'border-r',
            v === value
              ? 'bg-[rgba(8,47,73,.6)] text-[#7dd3fc]'
              : 'text-[#8ba4c4] hover:text-white'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
```

Everything else in the file is unchanged.

- [ ] **Step 2: StrengthPills**

Change `size?: 'sm' | 'md'` to `size?: 'sm' | 'md' | 'lg'` and the body to:

```tsx
export function StrengthPills({ value, onChange, disabled = false, size = 'md', ariaLabel = 'Strength' }: Props) {
  const isSm = size === 'sm'
  const isLg = size === 'lg'
  const labels = size === 'md' ? LONG_LABELS : SHORT_LABELS
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex border border-[#223a5c] overflow-hidden font-plex font-bold uppercase',
        isLg ? 'rounded-md text-[9px] tracking-[.1em]' : 'rounded tracking-[.12em]',
        isSm && 'text-[8.5px]',
        size === 'md' && 'flex w-full text-[9px]'
      )}
    >
      {OPTIONS.map((opt, i) => {
        const selected = value === opt
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={LONG_LABELS[opt]}
            disabled={disabled}
            onClick={() => { if (!disabled) onChange(opt) }}
            className={cn(
              'transition-colors whitespace-nowrap border-[#223a5c]',
              isLg ? 'w-[58px] h-[38px]' : isSm ? 'px-2 h-6' : 'flex-1 h-8',
              i < OPTIONS.length - 1 && 'border-r',
              selected
                ? 'bg-[rgba(8,47,73,.6)] text-[#7dd3fc]'
                : 'text-[#8ba4c4] hover:text-white',
              disabled && 'opacity-50 cursor-not-allowed hover:text-[#8ba4c4]'
            )}
          >
            {labels[opt]}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Check the existing callers still render the same**

Run: `npx tsc --noEmit && npm test -- __tests__ components 2>&1 | tail -5`
Expected: tsc clean; every existing suite passes (callers pass `sm`, `md` or nothing, whose class output is unchanged).

- [ ] **Step 4: Commit**

```bash
git add components/ui/MentalityControl.tsx components/ui/StrengthPills.tsx
git commit -m "Add the lg size to MentalityControl and StrengthPills

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Roster wizard

**Files:**
- Modify: `components/new-league/StepShell.tsx` (`STEP_COUNT`)
- Modify: `components/new-league/NewLeagueWizard.tsx` (destination after create)
- Create: `components/new-league/PlayerRow.tsx`
- Create: `components/new-league/PlayersStep.tsx`
- Create: `components/new-league/MentalityStep.tsx`
- Create: `components/new-league/StrengthStep.tsx`
- Create: `components/new-league/RosterWizard.tsx`
- Create: `components/new-league/RosterScreen.tsx`
- Modify: `app/new/[[...step]]/page.tsx`

- [ ] **Step 1: Step count and destination**

In `StepShell.tsx` change `export const STEP_COUNT = 3` to `export const STEP_COUNT = 6`. In `NewLeagueWizard.tsx` change `router.push(\`/new/${data.slug}/live\`)` to `router.push(\`/new/${data.slug}/players\`)`.

- [ ] **Step 2: PlayerRow**

```tsx
// components/new-league/PlayerRow.tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  name: ReactNode
  /** The creator's row: sky border and a YOU badge, never removable. */
  you?: boolean
  /** Right-hand control. */
  children?: ReactNode
  className?: string
}

/** One 50px roster row shared by the three roster screens. */
export function PlayerRow({ name, you = false, children, className }: Props) {
  return (
    <div
      className={cn(
        'flex h-[50px] items-center gap-3 rounded-lg border bg-[#0a1421] pl-4 pr-1.5',
        you ? 'border-[#38bdf8]/45' : 'border-[#1b2c46]',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 font-inter-body text-[15px] font-semibold text-[#f4f9ff]">
        {name}
        {you && (
          <span className="rounded-[3px] bg-[#38bdf8] px-1.5 py-[3px] font-plex text-[8px] font-bold uppercase tracking-[.14em] text-[#05101d]">
            You
          </span>
        )}
      </div>
      {children}
    </div>
  )
}
```

- [ ] **Step 3: PlayersStep**

```tsx
// components/new-league/PlayersStep.tsx
'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { splitPastedNames } from '@/lib/playerUtils'
import { FIELD, PRIMARY_BUTTON, SECONDARY_LINK, StepEyebrow, StepShell } from './StepShell'
import { PlayerRow } from './PlayerRow'
import type { RosterPlayer } from './RosterWizard'

interface Props {
  players: RosterPlayer[]
  /** Names already in the league's roster, for the duplicate check. */
  existingNames: string[]
  onAdd: (names: string[]) => void
  onRename: (id: string, name: string) => void
  onRemove: (id: string) => void
  onNext: () => void
}

const MIN_PLAYERS = 2
const TWO_SIDES = 10

export function PlayersStep({ players, existingNames, onAdd, onRename, onRemove, onNext }: Props) {
  const [draft, setDraft] = useState('')
  const [pasteMode, setPasteMode] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const taken = new Set([...players.map((p) => p.name), ...existingNames].map((n) => n.toLowerCase()))
  const isTaken = (name: string) => taken.has(name.trim().toLowerCase())
  const pasted = pasteMode ? splitPastedNames(draft).filter((n) => !isTaken(n)) : []

  function addOne() {
    const name = draft.trim()
    if (!name) return
    if (isTaken(name)) {
      setError('Already on the list')
      return
    }
    onAdd([name])
    setDraft('')
    setError(null)
  }

  function addPasted() {
    if (pasted.length === 0) return
    onAdd(pasted)
    setDraft('')
    setPasteMode(false)
  }

  const count = players.length
  const enough = count >= TWO_SIDES

  return (
    <StepShell
      eyebrow={<StepEyebrow n={4} />}
      title="Who plays?"
      sub="Add the regulars by name. They do not need an account yet."
      action={<button type="button" className={PRIMARY_BUTTON} disabled={count < MIN_PLAYERS} onClick={onNext}>Continue</button>}
      secondary={
        <button type="button" className={SECONDARY_LINK} onClick={() => { setPasteMode((m) => !m); setDraft(''); setError(null) }}>
          {pasteMode ? 'Add one at a time instead' : 'Paste a list instead'}
        </button>
      }
    >
      <ul className="flex flex-col gap-2">
        {players.map((p) => (
          <li key={p.id}>
            {p.you ? (
              <PlayerRow name={p.name} you />
            ) : (
              <PlayerRow
                className="pl-1.5"
                name={
                  <input
                    aria-label={`Player name ${p.name}`}
                    className="h-[38px] w-full rounded-md bg-transparent px-2.5 font-inter-body text-[15px] font-semibold text-[#f4f9ff] focus:border focus:border-[#38bdf8] focus:bg-[#0c1728] focus:outline-none"
                    value={p.name}
                    onChange={(e) => onRename(p.id, e.target.value)}
                    onBlur={(e) => { const v = e.target.value.trim(); v ? onRename(p.id, v) : onRemove(p.id) }}
                  />
                }
              >
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => onRemove(p.id)}
                  className="flex size-[38px] shrink-0 items-center justify-center rounded-md text-[#4f688a] transition-colors hover:bg-[#e2686f]/10 hover:text-[#e2686f]"
                >
                  <X className="size-4" />
                </button>
              </PlayerRow>
            )}
          </li>
        ))}
        <li>
          {pasteMode ? (
            <div className="rounded-lg border border-[#38bdf8]/45 p-2">
              <textarea
                aria-label="Paste player names"
                className={cn(FIELD, 'h-auto border-0 bg-transparent px-2 py-2 text-sm')}
                rows={5}
                placeholder="One name per line, or separated by commas"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
              />
              <button type="button" className={cn(PRIMARY_BUTTON, 'mt-2 h-[38px] text-[13px]')} disabled={pasted.length === 0} onClick={addPasted}>
                Add {pasted.length} {pasted.length === 1 ? 'player' : 'players'}
              </button>
            </div>
          ) : (
            <div className="flex h-[50px] items-center gap-2 rounded-lg border border-dashed border-[#223a5c] pl-1.5 pr-1.5">
              <input
                aria-label="Add a player"
                className="h-[38px] min-w-0 flex-1 bg-transparent px-2.5 font-inter-body text-[15px] text-[#f4f9ff] placeholder:text-[#4f688a] focus:outline-none"
                placeholder="Add a player and press Enter"
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setError(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOne() } }}
                autoFocus
              />
              <button type="button" className={cn(PRIMARY_BUTTON, 'h-[38px] w-auto px-4 text-[13px]')} disabled={!draft.trim()} onClick={addOne}>
                Add
              </button>
            </div>
          )}
          {error && <p role="alert" className="mt-1.5 px-2 font-inter-body text-[12.5px] text-[#e2686f]">{error}</p>}
        </li>
      </ul>
      <p className={cn('mt-3 text-center font-plex text-[9.5px] font-bold uppercase tracking-[.14em]', enough ? 'text-[#bef264]' : 'text-[#4f688a]')}>
        {count} {count === 1 ? 'player' : 'players'} · {enough ? 'enough for two sides' : `${TWO_SIDES} fills two sides of five`}
      </p>
    </StepShell>
  )
}
```

- [ ] **Step 4: MentalityStep and StrengthStep**

```tsx
// components/new-league/MentalityStep.tsx
'use client'

import type { Mentality } from '@/lib/types'
import { MentalityControl } from '@/components/ui/MentalityControl'
import { PRIMARY_BUTTON, StepEyebrow, StepShell } from './StepShell'
import { PlayerRow } from './PlayerRow'
import type { RosterPlayer } from './RosterWizard'

interface Props {
  players: RosterPlayer[]
  onChange: (id: string, mentality: Mentality) => void
  onNext: () => void
}

export function MentalityStep({ players, onChange, onNext }: Props) {
  return (
    <StepShell
      eyebrow={<StepEyebrow n={5} />}
      title="How does each of them play?"
      sub="GK is a dedicated keeper, in goal every game. Defensive, balanced and attacking help spread the shape across both sides."
      action={<button type="button" className={PRIMARY_BUTTON} onClick={onNext}>Continue</button>}
    >
      <ul className="flex flex-col gap-2">
        {players.map((p) => (
          <li key={p.id}>
            <PlayerRow name={<span className="truncate">{p.name}</span>} you={p.you}>
              <MentalityControl size="lg" value={p.mentality} onChange={(m) => onChange(p.id, m)} />
            </PlayerRow>
          </li>
        ))}
      </ul>
    </StepShell>
  )
}
```

```tsx
// components/new-league/StrengthStep.tsx
'use client'

import type { Strength } from '@/lib/types'
import { StrengthPills } from '@/components/ui/StrengthPills'
import { PRIMARY_BUTTON, StepEyebrow, StepShell } from './StepShell'
import { PlayerRow } from './PlayerRow'
import type { RosterPlayer } from './RosterWizard'

interface Props {
  players: RosterPlayer[]
  onChange: (id: string, strength: Strength) => void
  onSubmit: () => void
  submitting: boolean
  error: string | null
}

export function StrengthStep({ players, onChange, onSubmit, submitting, error }: Props) {
  return (
    <StepShell
      eyebrow={<StepEyebrow n={6} />}
      title="Who is above or below average?"
      sub="A gut call to seed the first lineups. It fades out over each player's first ten games. Members can see it, so keep it fair."
      action={
        <>
          <button type="button" className={PRIMARY_BUTTON} disabled={submitting} onClick={onSubmit}>
            {submitting ? 'Saving…' : 'Continue'}
          </button>
          {error && <p role="alert" className="mt-3 text-center font-inter-body text-[13px] text-[#e2686f]">{error}</p>}
        </>
      }
    >
      <ul className="flex flex-col gap-2">
        {players.map((p) => (
          <li key={p.id}>
            <PlayerRow name={<span className="truncate">{p.name}</span>} you={p.you}>
              <StrengthPills size="lg" value={p.strength} onChange={(s) => onChange(p.id, s)} ariaLabel={`Strength of ${p.name}`} />
            </PlayerRow>
          </li>
        ))}
      </ul>
    </StepShell>
  )
}
```

- [ ] **Step 5: RosterWizard**

```tsx
// components/new-league/RosterWizard.tsx
'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { Mentality, Strength } from '@/lib/types'
import { PlayersStep } from './PlayersStep'
import { MentalityStep } from './MentalityStep'
import { StrengthStep } from './StrengthStep'

const STEPS = ['players', 'mentality', 'strength'] as const
type Step = (typeof STEPS)[number]

export interface RosterPlayer {
  id: string
  name: string
  /** The creator: fixed first, not removable. */
  you?: boolean
  mentality: Mentality
  strength: Strength
}

interface Props {
  leagueId: string
  slug: string
  /** The creator's player name, from their approved claim. */
  you: string
  /** Names already in player_attributes, used only for the duplicate check. */
  existingNames: string[]
}

function stepFromPath(pathname: string): Step {
  const last = pathname.split('/').pop() ?? ''
  return (STEPS as readonly string[]).includes(last) ? (last as Step) : 'players'
}

const newPlayer = (name: string): RosterPlayer => ({ id: crypto.randomUUID(), name, mentality: 'balanced', strength: 'average' })

/**
 * Who plays, Mentality and Strength. The roster lives here and is written
 * once, at the end of Strength. Step URLs change through pushState like the
 * pre-creation wizard; a hard load with only the creator goes back to players.
 */
export function RosterWizard({ leagueId, slug, you, existingNames }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [players, setPlayers] = useState<RosterPlayer[]>([{ ...newPlayer(you), id: 'you', you: true }])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const step = players.length < 2 ? 'players' : stepFromPath(pathname)

  useEffect(() => {
    if (players.length < 2 && stepFromPath(pathname) !== 'players') router.replace(`/new/${slug}/players`)
  }, [pathname, players.length, router, slug])

  const go = (next: Step) => window.history.pushState(null, '', `/new/${slug}/${next}`)
  const patch = (id: string, change: Partial<RosterPlayer>) =>
    setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, ...change } : p)))

  async function save() {
    setSubmitting(true)
    setError(null)
    let res: Response
    try {
      res = await fetch(`/api/league/${leagueId}/roster`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players: players.map(({ name, strength, mentality }) => ({ name, strength, mentality })) }),
      })
    } catch {
      setError('Could not save the roster. Check your connection and try again.')
      setSubmitting(false)
      return
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(res.status === 400 && typeof data.error === 'string' ? data.error : 'Could not save the roster. Try again.')
      setSubmitting(false)
      return
    }
    router.push(`/new/${slug}/live`)
  }

  if (step === 'mentality') {
    return <MentalityStep players={players} onChange={(id, mentality) => patch(id, { mentality })} onNext={() => go('strength')} />
  }
  if (step === 'strength') {
    return <StrengthStep players={players} onChange={(id, strength) => patch(id, { strength })} onSubmit={save} submitting={submitting} error={error} />
  }
  return (
    <PlayersStep
      players={players}
      existingNames={existingNames}
      onAdd={(names) => setPlayers((ps) => [...ps, ...names.map(newPlayer)])}
      onRename={(id, name) => patch(id, { name })}
      onRemove={(id) => setPlayers((ps) => ps.filter((p) => p.id !== id))}
      onNext={() => go('mentality')}
    />
  )
}
```

- [ ] **Step 6: RosterScreen (server)**

```tsx
// components/new-league/RosterScreen.tsx
import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getAuthAndRole, getGameBySlug } from '@/lib/fetchers'
import { createServiceClient } from '@/lib/supabase/service'
import { leagueLandingPath, VIEWPORT_COOKIE } from '@/lib/utils'
import { RosterWizard } from './RosterWizard'

/** The roster steps. Admins only; the viewer's player comes from their approved claim. */
export async function RosterScreen({ slug }: { slug: string }) {
  const game = await getGameBySlug(slug)
  if (!game) notFound()

  const { user, userRole } = await getAuthAndRole(game.id)
  if (!user || (userRole !== 'creator' && userRole !== 'admin')) {
    redirect(leagueLandingPath(slug, (await headers()).get('user-agent'), (await cookies()).get(VIEWPORT_COOKIE)?.value))
  }

  const service = createServiceClient()
  const [{ data: claim }, { data: roster }] = await Promise.all([
    service.from('player_claims').select('player_name, admin_override_name').eq('game_id', game.id).eq('user_id', user.id).eq('status', 'approved').maybeSingle(),
    service.from('player_attributes').select('name').eq('game_id', game.id),
  ])
  const you = (claim?.admin_override_name as string | null) ?? (claim?.player_name as string | undefined)
  // Every league created through /new gives its creator a claim; without one there is no fixed row.
  if (!you) redirect(`/new/${slug}/live`)

  const existingNames = (roster ?? []).map((r) => r.name as string).filter((n) => n !== you)
  return <RosterWizard leagueId={game.id} slug={slug} you={you} existingNames={existingNames} />
}
```

- [ ] **Step 7: Page dispatch**

Replace `app/new/[[...step]]/page.tsx` with:

```tsx
// app/new/[[...step]]/page.tsx
import type { Metadata } from 'next'
import { NewLeagueWizard } from '@/components/new-league/NewLeagueWizard'
import { LiveScreen } from '@/components/new-league/LiveScreen'
import { RosterScreen } from '@/components/new-league/RosterScreen'

interface Props {
  params: Promise<{ step?: string[] }>
}

const ROSTER_STEPS = ['players', 'mentality', 'strength']
const isLive = (step: string[]) => step.length === 2 && step[1] === 'live'
const isRoster = (step: string[]) => step.length === 2 && ROSTER_STEPS.includes(step[1])

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { step = [] } = await params
  return { title: isLive(step) ? 'League created' : isRoster(step) ? 'Add your players' : 'Create a league' }
}

/**
 * Every /new URL. /new, /new/name, /new/where and /new/when render the wizard;
 * /new/[slug]/players, mentality and strength render the roster steps;
 * /new/[slug]/live renders the Live screen. One page because Next rejects
 * sibling dynamic segments with different names. The proxy has already
 * required a session and a profile.
 */
export default async function NewLeaguePage({ params }: Props) {
  const { step = [] } = await params
  if (isLive(step)) return <LiveScreen slug={step[0]} />
  if (isRoster(step)) return <RosterScreen slug={step[0]} />
  return <NewLeagueWizard />
}
```

- [ ] **Step 8: Check**

Run: `npx tsc --noEmit && npx eslint components/new-league app/new components/ui/MentalityControl.tsx components/ui/StrengthPills.tsx`
Expected: both clean. If `react-hooks/set-state-in-effect` or `exhaustive-deps` fires, report the exact message rather than adding a disable comment.

Then with `npm run dev` running and no session: `curl -sI http://localhost:3000/new/craft-football/players | head -2` is a 307 to sign-in, and the dev log shows no compile error.

- [ ] **Step 9: Commit**

```bash
git add components/new-league components/ui app/new
git commit -m "Add the roster steps: who plays, mentality and strength

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Verify and open the PR

- [ ] **Step 1:** `npm test` (all suites pass), `npx tsc --noEmit`, `npm run build && npm run bundle-report` (the `/new/[[...step]]` route stays well under 100 kB; shared baseline unchanged).
- [ ] **Step 2:** Manual, signed in on local dev (Will): create a league, add two players by typing and three by pasting `A, B & C`, remove one, set a GK and an Above, Continue, confirm Live shows the chips and Settings → Players shows the values, then delete the league with `delete from games where slug = '…'`.
- [ ] **Step 3:** Push and open the PR against the slice 1 branch:

```bash
git push -u origin HEAD
gh pr create --base awmloveland/craft-football-onboarding --title "League creation 2/5: roster steps" --body "$(cat <<'EOF'
## Summary
Stacked on #194. Adds the Who plays, Mentality and Strength screens after Create league (handoff screens 5 to 7).

- Players are added one at a time or pasted as a list (split on newlines, commas, `&`, `/`, `and`), with a case-insensitive duplicate check; the creator is fixed first
- Mentality and Strength use the house `MentalityControl` and `StrengthPills` with a new `lg` size matching the design
- Nothing is written until Strength's Continue: one `PUT /api/league/[id]/roster` makes a single `promote_roster` call, then the user lands on Live, which shows the roster chips
- No migration

Spec: docs/superpowers/specs/2026-10-27-league-creation-slice-2-design.md

## Test plan
- [ ] `npm test`, `npx tsc --noEmit`, `npm run build`
- [ ] Signed in on local dev: create a league, add players by typing and pasting, set a GK and an Above, confirm Settings → Players and Live, delete the league

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
