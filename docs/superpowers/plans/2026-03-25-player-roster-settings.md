# Player Roster Settings Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Players tab to league Settings where admins can view all roster players and edit each player's eye-test rating (1–3) and mentality (GK/DEF/BAL/ATT) inline, with changes saving automatically.

**Architecture:** New `GET` + `PATCH` API routes read/write `player_attributes` directly (no new RPC needed). A `PlayerRosterPanel` client component handles optimistic updates and mobile tap-to-expand. The settings page gains a `'players'` section wired the same way as `'features'` and `'members'`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Supabase (server client), Jest + ts-jest

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `lib/types.ts` | Add `PlayerAttribute` type |
| Create | `app/api/league/[id]/players/route.ts` | GET all players (admin only) |
| Create | `app/api/league/[id]/players/[name]/route.ts` | PATCH rating/mentality (admin only) |
| Create | `components/PlayerRosterPanel.tsx` | Inline-editing player list |
| Modify | `app/[leagueId]/settings/page.tsx` | Add Players tab + data loading |
| Create | `__tests__/player-roster.test.ts` | Unit tests for validation + type |

---

### Task 1: Add `PlayerAttribute` type and validation helper

**Files:**
- Modify: `lib/types.ts`
- Create: `__tests__/player-roster.test.ts`

- [ ] **Step 1: Add the type to `lib/types.ts`**

  Open `lib/types.ts`. After the `Mentality` type definition (line 22), add:

  ```ts
  export interface PlayerAttribute {
    name: string;
    rating: number;   // 1–3
    mentality: Mentality;
  }
  ```

- [ ] **Step 2: Write the failing tests**

  Create `__tests__/player-roster.test.ts`:

  ```ts
  // __tests__/player-roster.test.ts
  import type { PlayerAttribute, Mentality } from '@/lib/types'
  import { parsePlayerPatch } from '@/lib/playerUtils'

  // ── PlayerAttribute type ─────────────────────────────────────

  describe('PlayerAttribute type', () => {
    it('accepts valid rating and mentality', () => {
      const p: PlayerAttribute = { name: 'Alice', rating: 2, mentality: 'balanced' }
      expect(p.rating).toBe(2)
      expect(p.mentality).toBe('balanced')
    })
  })

  // ── parsePlayerPatch ─────────────────────────────────────────

  describe('parsePlayerPatch', () => {
    it('accepts valid rating only', () => {
      expect(parsePlayerPatch({ rating: 3 })).toEqual({ rating: 3 })
    })

    it('accepts valid mentality only', () => {
      expect(parsePlayerPatch({ mentality: 'attacking' })).toEqual({ mentality: 'attacking' })
    })

    it('accepts both fields', () => {
      expect(parsePlayerPatch({ rating: 1, mentality: 'defensive' })).toEqual({
        rating: 1,
        mentality: 'defensive',
      })
    })

    it('returns null when body is not an object', () => {
      expect(parsePlayerPatch(null)).toBeNull()
      expect(parsePlayerPatch('foo')).toBeNull()
    })

    it('returns null when rating is out of range', () => {
      expect(parsePlayerPatch({ rating: 0 })).toBeNull()
      expect(parsePlayerPatch({ rating: 4 })).toBeNull()
    })

    it('returns null when rating is not an integer', () => {
      expect(parsePlayerPatch({ rating: 1.5 })).toBeNull()
    })

    it('returns null when mentality is not a valid value', () => {
      expect(parsePlayerPatch({ mentality: 'striker' })).toBeNull()
    })

    it('returns null when neither field is provided', () => {
      expect(parsePlayerPatch({})).toBeNull()
    })
  })
  ```

- [ ] **Step 3: Run tests to confirm they fail**

  ```bash
  npx jest __tests__/player-roster.test.ts --no-coverage
  ```

  Expected: FAIL — `Cannot find module '@/lib/playerUtils'`

- [ ] **Step 4: Create `lib/playerUtils.ts` with `parsePlayerPatch`**

  Create `lib/playerUtils.ts`:

  ```ts
  import type { Mentality, PlayerAttribute } from '@/lib/types'

  const VALID_MENTALITIES: Mentality[] = ['goalkeeper', 'defensive', 'balanced', 'attacking']

  export type PlayerPatch = Partial<Pick<PlayerAttribute, 'rating' | 'mentality'>>

  /**
   * Validates and parses a PATCH request body.
   * Returns a typed patch object, or null if the body is invalid.
   */
  export function parsePlayerPatch(body: unknown): PlayerPatch | null {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return null

    const b = body as Record<string, unknown>
    const patch: PlayerPatch = {}

    if ('rating' in b) {
      const r = b.rating
      if (typeof r !== 'number' || !Number.isInteger(r) || r < 1 || r > 3) return null
      patch.rating = r
    }

    if ('mentality' in b) {
      const m = b.mentality
      if (typeof m !== 'string' || !VALID_MENTALITIES.includes(m as Mentality)) return null
      patch.mentality = m as Mentality
    }

    if (Object.keys(patch).length === 0) return null
    return patch
  }
  ```

- [ ] **Step 5: Run tests to confirm they pass**

  ```bash
  npx jest __tests__/player-roster.test.ts --no-coverage
  ```

  Expected: All 9 tests PASS

- [ ] **Step 6: Commit**

  ```bash
  git add lib/types.ts lib/playerUtils.ts __tests__/player-roster.test.ts
  git commit -m "feat: add PlayerAttribute type and parsePlayerPatch validation helper"
  ```

---

### Task 2: GET `/api/league/[id]/players` route

**Files:**
- Create: `app/api/league/[id]/players/route.ts`

- [ ] **Step 1: Create the route file**

  Create `app/api/league/[id]/players/route.ts`:

  ```ts
  import { createClient } from '@/lib/supabase/server'
  import { NextResponse } from 'next/server'

  /** GET — returns all players in a league. Admin only. */
  export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
  ) {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: isAdmin } = await supabase.rpc('is_game_admin', { p_game_id: id })
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data, error } = await supabase
      .from('player_attributes')
      .select('name, rating, mentality')
      .eq('game_id', id)
      .order('name', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data ?? [])
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```

  Expected: No errors

- [ ] **Step 3: Commit**

  ```bash
  git add app/api/league/\[id\]/players/route.ts
  git commit -m "feat: add GET /api/league/[id]/players route"
  ```

---

### Task 3: PATCH `/api/league/[id]/players/[name]` route

**Files:**
- Create: `app/api/league/[id]/players/[name]/route.ts`

- [ ] **Step 1: Create the route file**

  Create `app/api/league/[id]/players/[name]/route.ts`:

  ```ts
  import { createClient } from '@/lib/supabase/server'
  import { NextResponse } from 'next/server'
  import { parsePlayerPatch } from '@/lib/playerUtils'

  /** PATCH — update a player's rating and/or mentality. Admin only. */
  export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string; name: string }> }
  ) {
    const { id, name } = await params
    const playerName = decodeURIComponent(name)

    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: isAdmin } = await supabase.rpc('is_game_admin', { p_game_id: id })
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => null)
    const patch = parsePlayerPatch(body)
    if (!patch) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

    const { data, error } = await supabase
      .from('player_attributes')
      .update(patch)
      .eq('game_id', id)
      .eq('name', playerName)
      .select('name, rating, mentality')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

    return NextResponse.json(data)
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```

  Expected: No errors

- [ ] **Step 3: Commit**

  ```bash
  git add "app/api/league/[id]/players/[name]/route.ts"
  git commit -m "feat: add PATCH /api/league/[id]/players/[name] route"
  ```

---

### Task 4: `PlayerRosterPanel` component

**Files:**
- Create: `components/PlayerRosterPanel.tsx`

- [ ] **Step 1: Create the component**

  Create `components/PlayerRosterPanel.tsx`:

  ```tsx
  'use client'

  import { useState, useCallback } from 'react'
  import { ChevronDown } from 'lucide-react'
  import { cn } from '@/lib/utils'
  import type { Mentality, PlayerAttribute } from '@/lib/types'

  interface Props {
    leagueId: string
    initialPlayers: PlayerAttribute[]
  }

  const MENTALITY_LABELS: { value: Mentality; label: string }[] = [
    { value: 'goalkeeper', label: 'GK' },
    { value: 'defensive',  label: 'DEF' },
    { value: 'balanced',   label: 'BAL' },
    { value: 'attacking',  label: 'ATT' },
  ]

  const MENTALITY_DISPLAY: Record<Mentality, string> = {
    goalkeeper: 'GK',
    defensive:  'DEF',
    balanced:   'BAL',
    attacking:  'ATT',
  }

  export function PlayerRosterPanel({ leagueId, initialPlayers }: Props) {
    const [players, setPlayers] = useState<PlayerAttribute[]>(initialPlayers)
    const [expandedName, setExpandedName] = useState<string | null>(null)
    const [errorName, setErrorName] = useState<string | null>(null)

    const patch = useCallback(
      async (name: string, update: Partial<Pick<PlayerAttribute, 'rating' | 'mentality'>>) => {
        // Capture current state before optimistic update so we can revert
        let snapshot: PlayerAttribute[] = []
        setPlayers((prev) => {
          snapshot = prev
          return prev.map((p) => (p.name === name ? { ...p, ...update } : p))
        })
        setErrorName(null)

        const res = await fetch(
          `/api/league/${leagueId}/players/${encodeURIComponent(name)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(update),
          }
        )

        if (!res.ok) {
          setPlayers(snapshot)
          setErrorName(name)
        }
      },
      [leagueId]
    )

    function handleRatingClick(player: PlayerAttribute, dot: number) {
      // Clicking the active dot decrements by 1 (min 1)
      const next = player.rating === dot ? Math.max(1, dot - 1) : dot
      if (next !== player.rating) patch(player.name, { rating: next })
    }

    if (players.length === 0) {
      return <p className="text-sm text-slate-400">No players in this league yet.</p>
    }

    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">
          {players.length} {players.length === 1 ? 'Player' : 'Players'}
        </p>

        {players.map((player) => {
          const isExpanded = expandedName === player.name
          const hasError = errorName === player.name

          return (
            <div
              key={player.name}
              className={cn(
                'rounded-lg bg-slate-800 border overflow-hidden',
                hasError ? 'border-red-800' : isExpanded ? 'border-slate-600' : 'border-slate-700'
              )}
            >
              {/* ── Row ── */}
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex-1 min-w-0 text-sm font-semibold text-slate-100 truncate">
                  {player.name}
                </span>

                {/* Desktop controls */}
                <div className="hidden sm:flex items-center gap-3">
                  {/* Rating dots */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-500 mr-1">Rating</span>
                    {[1, 2, 3].map((dot) => (
                      <button
                        key={dot}
                        onClick={() => handleRatingClick(player, dot)}
                        className={cn(
                          'w-4 h-4 rounded-full border-2 transition-colors',
                          dot <= player.rating
                            ? 'bg-blue-500 border-blue-600'
                            : 'bg-slate-900 border-slate-600 hover:border-slate-400'
                        )}
                        aria-label={`Set rating to ${dot}`}
                      />
                    ))}
                  </div>

                  {/* Divider */}
                  <div className="w-px h-4 bg-slate-700" />

                  {/* Mentality segmented control */}
                  <MentalityControl
                    value={player.mentality}
                    onChange={(m) => patch(player.name, { mentality: m })}
                  />
                </div>

                {/* Mobile collapsed state */}
                <button
                  className="sm:hidden flex items-center gap-2"
                  onClick={() => setExpandedName(isExpanded ? null : player.name)}
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${player.name}`}
                >
                  <span className="text-[10px] font-semibold bg-blue-950 text-blue-300 border border-blue-800 rounded px-1.5 py-0.5">
                    {MENTALITY_DISPLAY[player.mentality]}
                  </span>
                  <div className="flex gap-1">
                    {[1, 2, 3].map((dot) => (
                      <div
                        key={dot}
                        className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          dot <= player.rating ? 'bg-blue-500' : 'bg-slate-600'
                        )}
                      />
                    ))}
                  </div>
                  <ChevronDown
                    className={cn(
                      'size-3.5 text-slate-500 transition-transform',
                      isExpanded && 'rotate-180'
                    )}
                  />
                </button>
              </div>

              {/* ── Mobile expanded controls ── */}
              {isExpanded && (
                <div className="sm:hidden border-t border-slate-700 px-3 py-3 flex flex-col gap-3">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">Rating</p>
                    <div className="flex gap-2">
                      {[1, 2, 3].map((n) => (
                        <button
                          key={n}
                          onClick={() => handleRatingClick(player, n)}
                          className={cn(
                            'flex-1 py-1.5 rounded-md border text-sm font-semibold transition-colors',
                            n <= player.rating
                              ? 'bg-blue-950 border-blue-700 text-blue-300'
                              : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500'
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">Mentality</p>
                    <MentalityControl
                      value={player.mentality}
                      onChange={(m) => patch(player.name, { mentality: m })}
                      fullWidth
                    />
                  </div>
                </div>
              )}

              {/* Error state */}
              {hasError && (
                <p className="px-3 pb-2 text-[10px] text-red-400">Failed to save — please try again.</p>
              )}
            </div>
          )
        })}

        <p className="text-[10px] text-slate-600 text-center mt-1">Changes saved automatically</p>
      </div>
    )
  }

  function MentalityControl({
    value,
    onChange,
    fullWidth = false,
  }: {
    value: Mentality
    onChange: (m: Mentality) => void
    fullWidth?: boolean
  }) {
    return (
      <div
        className={cn(
          'flex bg-slate-900 border border-slate-700 rounded-md overflow-hidden text-[10px] font-semibold',
          fullWidth && 'w-full'
        )}
      >
        {MENTALITY_LABELS.map(({ value: v, label }, i) => (
          <button
            key={v}
            onClick={() => { if (v !== value) onChange(v) }}
            className={cn(
              'py-1 transition-colors',
              fullWidth ? 'flex-1' : 'px-2',
              i < MENTALITY_LABELS.length - 1 && 'border-r',
              v === value
                ? 'bg-blue-950 text-blue-300 border-blue-800'
                : 'text-slate-500 border-slate-700 hover:text-slate-300'
            )}
          >
            {label}
          </button>
        ))}
      </div>
    )
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```

  Expected: No errors

- [ ] **Step 3: Commit**

  ```bash
  git add components/PlayerRosterPanel.tsx
  git commit -m "feat: add PlayerRosterPanel component with inline rating and mentality editing"
  ```

---

### Task 5: Wire up the Players tab in Settings

**Files:**
- Modify: `app/[leagueId]/settings/page.tsx`

- [ ] **Step 1: Add the `'players'` section to the settings page**

  Open `app/[leagueId]/settings/page.tsx` and make the following changes:

  **1. Update the import at the top** — add `PlayerRosterPanel` and `UserCog`:

  ```ts
  // Change this line:
  import { ArrowLeft, Check, Copy, Info, RefreshCw, Settings2, Users } from 'lucide-react'
  // To:
  import { ArrowLeft, Check, Copy, Info, RefreshCw, Settings2, UserCog, Users } from 'lucide-react'
  ```

  ```ts
  // Add after the FeaturePanel import:
  import { PlayerRosterPanel } from '@/components/PlayerRosterPanel'
  ```

  ```ts
  // Add after the LeagueFeature import:
  import type { LeagueMember, LeagueFeature, LeagueDetails, PlayerAttribute } from '@/lib/types'
  ```

  **2. Update the `Section` type** (line 13):

  ```ts
  // Change:
  type Section = 'details' | 'members' | 'features'
  // To:
  type Section = 'details' | 'members' | 'features' | 'players'
  ```

  **3. Update `TabInitialiser`** — extend the valid tab check (inside the `useEffect`):

  ```ts
  // Change:
  if (tab === 'details' || tab === 'members' || tab === 'features') {
  // To:
  if (tab === 'details' || tab === 'members' || tab === 'features' || tab === 'players') {
  ```

  **4. Add players state** — after the `featuresLoading` state declaration:

  ```ts
  // Players state
  const [players, setPlayers] = useState<PlayerAttribute[]>([])
  const [playersLoading, setPlayersLoading] = useState(false)
  ```

  **5. Add `loadPlayers` callback** — after `loadFeatures`:

  ```ts
  const loadPlayers = useCallback(async () => {
    setPlayersLoading(true)
    try {
      const res = await fetch(`/api/league/${leagueId}/players`, { credentials: 'include' })
      const data = await res.json()
      setPlayers(Array.isArray(data) ? data : [])
    } finally {
      setPlayersLoading(false)
    }
  }, [leagueId])
  ```

  **6. Update the section-load `useEffect`** — add the players case:

  ```ts
  useEffect(() => {
    if (!isAdmin) return
    if (section === 'details') loadDetails()
    if (section === 'members') {
      loadMembers()
      fetchInviteLink('member')
      fetchInviteLink('admin')
    }
    if (section === 'features') loadFeatures()
    if (section === 'players') loadPlayers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, isAdmin, loadDetails, loadMembers, loadFeatures, loadPlayers])
  ```

  **7. Update the `NAV` array** — add the Players entry:

  ```ts
  const NAV: { id: Section; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'details',  label: 'League Details', Icon: Info },
    { id: 'members',  label: 'Members',        Icon: Users },
    { id: 'features', label: 'Features',       Icon: Settings2 },
    { id: 'players',  label: 'Players',        Icon: UserCog },
  ]
  ```

  **8. Add the Players section render** — after the `{/* ── FEATURES ── */}` block:

  ```tsx
  {/* ── PLAYERS ── */}
  {section === 'players' && (
    <div>
      {playersLoading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : (
        <PlayerRosterPanel
          leagueId={leagueId}
          initialPlayers={players}
        />
      )}
    </div>
  )}
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```

  Expected: No errors

- [ ] **Step 3: Run all tests**

  ```bash
  npx jest --no-coverage
  ```

  Expected: All tests PASS

- [ ] **Step 4: Commit**

  ```bash
  git add app/\[leagueId\]/settings/page.tsx
  git commit -m "feat: add Players tab to league settings with inline roster editing"
  ```
