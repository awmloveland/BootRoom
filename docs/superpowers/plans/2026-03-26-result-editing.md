# Result & Lineup Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to edit any past week's date, status, result, lineups, margin, and notes directly from the results tab via a modal.

**Architecture:** A new `EditWeekModal` component is wired into all four card states in `MatchCard.tsx`. It calls a dedicated `PATCH /api/league/[id]/weeks/[weekId]/edit` route which invokes a new `edit_week` Supabase RPC. The existing `ResultModal` and `record_result` RPC are left untouched.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Supabase (PostgreSQL + RPC), Radix UI (no new dependencies)

---

## File Map

| Action | File |
|---|---|
| Create | `supabase/migrations/20260326000001_edit_week_rpc.sql` |
| Create | `app/api/league/[id]/weeks/[weekId]/edit/route.ts` |
| Create | `components/EditWeekModal.tsx` |
| Modify | `components/MatchCard.tsx` |

---

### Task 1: Migration — `edit_week` RPC

**Files:**
- Create: `supabase/migrations/20260326000001_edit_week_rpc.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260326000001_edit_week_rpc.sql
--
-- Admin-only RPC to edit any existing week.
-- Clears team_a_rating / team_b_rating on every call (no stale snapshots).
-- When status != 'played', also clears all result/lineup fields.

CREATE OR REPLACE FUNCTION edit_week(
  p_week_id         UUID,
  p_date            TEXT,
  p_status          TEXT,
  p_winner          TEXT    DEFAULT NULL,
  p_notes           TEXT    DEFAULT NULL,
  p_goal_difference INTEGER DEFAULT NULL,
  p_team_a          JSONB   DEFAULT NULL,
  p_team_b          JSONB   DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game_id UUID;
BEGIN
  SELECT game_id INTO v_game_id FROM weeks WHERE id = p_week_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Week not found'; END IF;

  IF NOT is_game_admin(v_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_status = 'played' THEN
    UPDATE weeks
    SET date            = p_date,
        status          = 'played',
        winner          = p_winner,
        notes           = p_notes,
        goal_difference = p_goal_difference,
        team_a          = COALESCE(p_team_a, '[]'::jsonb),
        team_b          = COALESCE(p_team_b, '[]'::jsonb),
        team_a_rating   = NULL,
        team_b_rating   = NULL
    WHERE id = p_week_id;
  ELSE
    UPDATE weeks
    SET date            = p_date,
        status          = p_status,
        winner          = NULL,
        notes           = p_notes,
        goal_difference = NULL,
        team_a          = '[]'::jsonb,
        team_b          = '[]'::jsonb,
        team_a_rating   = NULL,
        team_b_rating   = NULL
    WHERE id = p_week_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_week(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, JSONB, JSONB) TO authenticated;
```

- [ ] **Step 2: Run the migration in Supabase**

Paste the SQL into the Supabase SQL Editor and run it. Verify it completes without errors.

- [ ] **Step 3: Verify the function exists**

In the Supabase SQL Editor:

```sql
SELECT proname, prosecdef FROM pg_proc WHERE proname = 'edit_week';
```

Expected: one row with `proname = edit_week` and `prosecdef = true`.

- [ ] **Step 4: Smoke test the RPC (as admin)**

In SQL Editor (replace UUIDs with real values from your dev league):

```sql
-- Should succeed for an admin calling from context with a valid game_id
SELECT edit_week(
  '<a real week id>',
  '26 Mar 2026',
  'cancelled',
  NULL, 'Test edit', NULL, NULL, NULL
);

-- Confirm the row updated
SELECT date, status, notes, winner, goal_difference, team_a_rating
FROM weeks WHERE id = '<that week id>';
```

Expected: `status = cancelled`, `notes = 'Test edit'`, `winner = null`, `team_a_rating = null`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260326000001_edit_week_rpc.sql
git commit -m "feat: add edit_week RPC for admin result editing"
```

---

### Task 2: API Route — `PATCH /api/league/[id]/weeks/[weekId]/edit`

**Files:**
- Create: `app/api/league/[id]/weeks/[weekId]/edit/route.ts`

This is a new file in a new `edit/` subdirectory — separate from the existing `route.ts` in `weeks/[weekId]/` which handles scheduled week date changes.

- [ ] **Step 1: Create the route file**

```typescript
// app/api/league/[id]/weeks/[weekId]/edit/route.ts

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const VALID_STATUSES = ['played', 'cancelled', 'unrecorded'] as const
type EditStatus = typeof VALID_STATUSES[number]

/** PATCH — admin-only, edits any field on an existing week. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; weekId: string }> }
) {
  const { id, weekId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await supabase.rpc('is_game_admin', { p_game_id: id })
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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

  const status = typeof b.status === 'string' ? b.status : ''
  if (!VALID_STATUSES.includes(status as EditStatus)) {
    return NextResponse.json(
      { error: 'status must be played, cancelled, or unrecorded' },
      { status: 400 }
    )
  }

  const winner = typeof b.winner === 'string' ? b.winner : null
  const notes = typeof b.notes === 'string' ? b.notes : null
  const goalDifference = typeof b.goalDifference === 'number' ? b.goalDifference : null
  const teamA = Array.isArray(b.teamA) ? b.teamA : null
  const teamB = Array.isArray(b.teamB) ? b.teamB : null

  const { error } = await supabase.rpc('edit_week', {
    p_week_id: weekId,
    p_date: date,
    p_status: status,
    p_winner: winner,
    p_notes: notes,
    p_goal_difference: goalDifference,
    p_team_a: teamA,
    p_team_b: teamB,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify the route file compiles**

```bash
npx tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 3: Manual test — unauthenticated request is rejected**

```bash
curl -s -X PATCH http://localhost:3000/api/league/any-id/weeks/any-id/edit \
  -H "Content-Type: application/json" \
  -d '{"date":"26 Mar 2026","status":"cancelled"}' | jq .
```

Expected: `{"error":"Unauthorized"}` with status 401.

- [ ] **Step 4: Commit**

```bash
git add app/api/league/[id]/weeks/[weekId]/edit/route.ts
git commit -m "feat: add PATCH /weeks/[weekId]/edit admin route"
```

---

### Task 3: `EditWeekModal` Component

**Files:**
- Create: `components/EditWeekModal.tsx`

- [ ] **Step 1: Create the component file**

```typescript
// components/EditWeekModal.tsx
'use client'

import { useState } from 'react'
import { X, Pencil } from 'lucide-react'
import type { Week, Player, Winner } from '@/lib/types'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface EditWeekModalProps {
  week: Week
  gameId: string
  allPlayers: Player[]
  onSaved: () => void
  onClose: () => void
}

type EditStatus = 'played' | 'cancelled' | 'unrecorded'

// ── PlayerChip ────────────────────────────────────────────────────────────────

function PlayerChip({
  name,
  team,
  onRemove,
  onDragStart,
}: {
  name: string
  team: 'A' | 'B' | 'roster'
  onRemove?: () => void
  onDragStart: (e: React.DragEvent) => void
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cn(
        'flex items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm cursor-grab select-none',
        team === 'A' && 'bg-slate-900 border border-blue-800 text-slate-200',
        team === 'B' && 'bg-slate-900 border border-violet-800 text-slate-200',
        team === 'roster' && 'bg-slate-900 border border-slate-700 text-slate-400'
      )}
    >
      <span>{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-slate-500 hover:text-slate-300 leading-none text-base"
          aria-label={`Remove ${name}`}
        >
          ×
        </button>
      )}
    </div>
  )
}

// ── LineupEditor ──────────────────────────────────────────────────────────────

function LineupEditor({
  teamA,
  teamB,
  allPlayers,
  onChangeTeamA,
  onChangeTeamB,
}: {
  teamA: string[]
  teamB: string[]
  allPlayers: Player[]
  onChangeTeamA: (names: string[]) => void
  onChangeTeamB: (names: string[]) => void
}) {
  const [dragOverA, setDragOverA] = useState(false)
  const [dragOverB, setDragOverB] = useState(false)
  const [search, setSearch] = useState('')

  const assignedNames = new Set([...teamA, ...teamB])
  const roster = allPlayers
    .map((p) => p.name)
    .filter((name) => !assignedNames.has(name))
    .filter((name) => name.toLowerCase().includes(search.toLowerCase()))

  function handleDrop(target: 'A' | 'B', e: React.DragEvent) {
    e.preventDefault()
    const name = e.dataTransfer.getData('playerName')
    const source = e.dataTransfer.getData('source') as 'teamA' | 'teamB' | 'roster'
    if (!name) return

    if (target === 'A') {
      setDragOverA(false)
      if (source === 'teamB') onChangeTeamB(teamB.filter((n) => n !== name))
      if (!teamA.includes(name)) onChangeTeamA([...teamA, name])
    } else {
      setDragOverB(false)
      if (source === 'teamA') onChangeTeamA(teamA.filter((n) => n !== name))
      if (!teamB.includes(name)) onChangeTeamB([...teamB, name])
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {/* Team A */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOverA(true) }}
          onDragLeave={() => setDragOverA(false)}
          onDrop={(e) => handleDrop('A', e)}
          className={cn(
            'rounded-lg border p-2.5 min-h-[80px] flex flex-col gap-1.5 transition-colors',
            dragOverA ? 'border-blue-600 bg-blue-950/20' : 'border-slate-700 bg-slate-800/50'
          )}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-400 mb-1">Team A</p>
          {teamA.map((name) => (
            <PlayerChip
              key={name}
              name={name}
              team="A"
              onRemove={() => onChangeTeamA(teamA.filter((n) => n !== name))}
              onDragStart={(e) => {
                e.dataTransfer.setData('playerName', name)
                e.dataTransfer.setData('source', 'teamA')
              }}
            />
          ))}
          {teamA.length === 0 && (
            <p className="text-xs text-slate-600 text-center pt-2">Drop players here</p>
          )}
        </div>

        {/* Team B */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOverB(true) }}
          onDragLeave={() => setDragOverB(false)}
          onDrop={(e) => handleDrop('B', e)}
          className={cn(
            'rounded-lg border p-2.5 min-h-[80px] flex flex-col gap-1.5 transition-colors',
            dragOverB ? 'border-violet-600 bg-violet-950/20' : 'border-slate-700 bg-slate-800/50'
          )}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-400 mb-1">Team B</p>
          {teamB.map((name) => (
            <PlayerChip
              key={name}
              name={name}
              team="B"
              onRemove={() => onChangeTeamB(teamB.filter((n) => n !== name))}
              onDragStart={(e) => {
                e.dataTransfer.setData('playerName', name)
                e.dataTransfer.setData('source', 'teamB')
              }}
            />
          ))}
          {teamB.length === 0 && (
            <p className="text-xs text-slate-600 text-center pt-2">Drop players here</p>
          )}
        </div>
      </div>

      {/* Roster */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Roster — drag into a team
        </p>
        <input
          type="text"
          placeholder="Search players"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500 mb-2"
        />
        <div className="flex flex-wrap gap-1.5">
          {roster.map((name) => (
            <PlayerChip
              key={name}
              name={name}
              team="roster"
              onDragStart={(e) => {
                e.dataTransfer.setData('playerName', name)
                e.dataTransfer.setData('source', 'roster')
              }}
            />
          ))}
          {roster.length === 0 && search === '' && (
            <p className="text-xs text-slate-600">All players assigned</p>
          )}
          {roster.length === 0 && search !== '' && (
            <p className="text-xs text-slate-600">No players match</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── EditWeekModal ─────────────────────────────────────────────────────────────

export function EditWeekModal({
  week,
  gameId,
  allPlayers,
  onSaved,
  onClose,
}: EditWeekModalProps) {
  const wasPlayed = week.status === 'played'
  // Awaiting Result weeks have status 'scheduled' — default the modal to 'played'
  const initialStatus: EditStatus =
    week.status === 'scheduled' ? 'played' : (week.status as EditStatus)

  const [date, setDate] = useState(week.date)
  const [status, setStatus] = useState<EditStatus>(initialStatus)
  const [winner, setWinner] = useState<Winner>(wasPlayed ? (week.winner ?? null) : null)
  const [margin, setMargin] = useState(
    wasPlayed && week.goal_difference != null && week.goal_difference > 0
      ? week.goal_difference
      : 1
  )
  const [notes, setNotes] = useState(week.notes ?? '')
  const [teamA, setTeamA] = useState<string[]>(week.teamA ?? [])
  const [teamB, setTeamB] = useState<string[]>(week.teamB ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Show warning when the game had a result and admin is switching away from played
  const showClearWarning = wasPlayed && status !== 'played'

  async function handleSave() {
    setError(null)

    if (!date || !/^\d{2} [A-Za-z]{3} \d{4}$/.test(date)) {
      setError('Date must be in DD MMM YYYY format, e.g. 26 Mar 2026')
      return
    }
    if (status === 'played' && !winner) {
      setError('Select a result')
      return
    }

    setSaving(true)

    const body: Record<string, unknown> = {
      date,
      status,
      notes: notes.trim() || null,
    }

    if (status === 'played') {
      body.winner = winner
      body.goalDifference = winner === 'draw' ? 0 : margin
      body.teamA = teamA
      body.teamB = teamB
    }

    try {
      const res = await fetch(`/api/league/${gameId}/weeks/${week.id}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Failed to save')
        return
      }

      onSaved()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-slate-100">
            Edit Week {week.week}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Date + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1.5">
                Date
              </label>
              <input
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="DD MMM YYYY"
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1.5">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as EditStatus)}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="played">Played</option>
                <option value="cancelled">Cancelled</option>
                <option value="unrecorded">Unrecorded</option>
              </select>
            </div>
          </div>

          {/* Clear warning */}
          {showClearWarning && (
            <p className="text-xs text-amber-400 bg-amber-950/30 border border-amber-900/50 rounded-md px-3 py-2">
              This will clear the recorded result and lineups.
            </p>
          )}

          {/* Played-only fields */}
          {status === 'played' && (
            <>
              {/* Result */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1.5">
                  Result
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['teamA', 'draw', 'teamB'] as Winner[]).map((opt) => (
                    <button
                      key={opt ?? 'null'}
                      type="button"
                      onClick={() => setWinner(opt)}
                      className={cn(
                        'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                        winner === opt
                          ? opt === 'teamA'
                            ? 'bg-blue-900 border-blue-700 text-blue-300'
                            : opt === 'teamB'
                            ? 'bg-violet-900 border-violet-700 text-violet-300'
                            : 'bg-slate-700 border-slate-500 text-slate-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                      )}
                    >
                      {opt === 'teamA' ? 'Team A' : opt === 'teamB' ? 'Team B' : 'Draw'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Margin */}
              {winner && winner !== 'draw' && (
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1.5">
                    Margin of victory
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setMargin((m) => Math.max(1, m - 1))}
                      className="h-8 w-8 rounded-md border border-slate-700 bg-slate-800 text-slate-300 text-lg leading-none hover:bg-slate-700 transition-colors"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm font-semibold text-slate-200">
                      {margin}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMargin((m) => Math.min(20, m + 1))}
                      className="h-8 w-8 rounded-md border border-slate-700 bg-slate-800 text-slate-300 text-lg leading-none hover:bg-slate-700 transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {/* Lineups */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1.5">
                  Lineups
                </label>
                <LineupEditor
                  teamA={teamA}
                  teamB={teamB}
                  allPlayers={allPlayers}
                  onChangeTeamA={setTeamA}
                  onChangeTeamB={setTeamB}
                />
              </div>
            </>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1.5">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes"
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-700 bg-transparent px-4 py-2 text-sm text-slate-400 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the component compiles**

```bash
npx tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add components/EditWeekModal.tsx
git commit -m "feat: add EditWeekModal component with lineup editor"
```

---

### Task 4: Wire Edit Entry Points into `MatchCard`

**Files:**
- Modify: `components/MatchCard.tsx`

This task updates all four card sub-components to support the edit flow. Each sub-component gets its own `showEditModal` state and renders `EditWeekModal` when triggered.

- [ ] **Step 1: Replace the full contents of `components/MatchCard.tsx`**

```typescript
'use client'

import { useState } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown, Pencil } from 'lucide-react'
import { Week } from '@/lib/types'
import type { Player, ScheduledWeek } from '@/lib/types'
import { WinnerBadge } from './WinnerBadge'
import { TeamList } from './TeamList'
import { cn, shouldShowMeta, isPastDeadline } from '@/lib/utils'
import { ResultModal } from '@/components/ResultModal'
import { EditWeekModal } from '@/components/EditWeekModal'

interface MatchCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  goalkeepers?: string[]
  isAdmin?: boolean
  gameId?: string
  allPlayers?: Player[]
  onResultSaved?: () => void
}

// ── Edit button helpers ───────────────────────────────────────────────────────

/** Small pencil icon used on non-expandable cards (cancelled, unrecorded). */
function EditIconButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="text-slate-600 hover:text-slate-400 p-1 rounded transition-colors"
      aria-label="Edit week"
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  )
}

/** Text button used inside expanded card bodies. */
function EditResultButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-md border border-slate-700 text-slate-400 text-sm hover:border-slate-500 hover:text-slate-300 transition-colors"
    >
      Edit result
    </button>
  )
}

// ── CancelledCard ─────────────────────────────────────────────────────────────

interface NonExpandableCardProps {
  week: Week
  isAdmin: boolean
  gameId: string
  allPlayers: Player[]
  onResultSaved: () => void
}

function CancelledCard({
  week,
  isAdmin,
  gameId,
  allPlayers,
  onResultSaved,
}: NonExpandableCardProps) {
  const [showEditModal, setShowEditModal] = useState(false)

  return (
    <>
      <div className="rounded-lg border border-slate-800 bg-slate-900 opacity-60">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-500">Week {week.week}</p>
            <p className="text-xs text-slate-600">{week.date}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <WinnerBadge winner={null} cancelled />
            {isAdmin && (
              <EditIconButton onClick={() => setShowEditModal(true)} />
            )}
          </div>
        </div>
      </div>
      {showEditModal && (
        <EditWeekModal
          week={week}
          gameId={gameId}
          allPlayers={allPlayers}
          onSaved={() => { setShowEditModal(false); onResultSaved() }}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </>
  )
}

// ── UnrecordedCard ────────────────────────────────────────────────────────────

function UnrecordedCard({
  week,
  isAdmin,
  gameId,
  allPlayers,
  onResultSaved,
}: NonExpandableCardProps) {
  const [showEditModal, setShowEditModal] = useState(false)

  return (
    <>
      <div className="rounded-lg border border-dashed border-slate-700 bg-[#131c2e]">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-500">Week {week.week}</p>
            <p className="text-xs text-slate-600">{week.date}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold rounded-full px-2.5 py-0.5 whitespace-nowrap bg-[#131c2e] text-slate-600 border border-dashed border-slate-700">
              Unrecorded
            </span>
            {isAdmin && (
              <EditIconButton onClick={() => setShowEditModal(true)} />
            )}
          </div>
        </div>
      </div>
      {showEditModal && (
        <EditWeekModal
          week={week}
          gameId={gameId}
          allPlayers={allPlayers}
          onSaved={() => { setShowEditModal(false); onResultSaved() }}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </>
  )
}

// ── AwaitingResultCard ────────────────────────────────────────────────────────

interface AwaitingResultCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  isAdmin: boolean
  gameId: string
  allPlayers: Player[]
  onResultSaved: () => void
}

function AwaitingResultCard({
  week,
  isOpen,
  onToggle,
  isAdmin,
  gameId,
  allPlayers,
  onResultSaved,
}: AwaitingResultCardProps) {
  const [showResultModal, setShowResultModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)

  const scheduledWeek: ScheduledWeek = {
    id: week.id ?? '',
    week: week.week,
    date: week.date,
    format: week.format ?? null,
    teamA: week.teamA,
    teamB: week.teamB,
    status: 'scheduled',
    lineupMetadata: week.lineupMetadata ?? null,
  }

  return (
    <>
      <Collapsible.Root open={isOpen} onOpenChange={onToggle}>
        <div
          className={cn(
            'rounded-lg border bg-slate-800 transition-colors duration-150',
            isOpen ? 'border-slate-600' : 'border-slate-700 hover:border-slate-500'
          )}
        >
          <Collapsible.Trigger asChild>
            <button
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer"
              aria-expanded={isOpen}
              aria-controls={`week-${week.week}-awaiting-content`}
            >
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-100">Week {week.week}</p>
                <p className="text-xs text-slate-400">
                  {week.date}
                  {week.format && <span className="ml-2 text-slate-400">· {week.format}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold rounded-full px-2.5 py-0.5 whitespace-nowrap bg-slate-800 text-slate-400 border border-slate-600">
                  Awaiting Result
                </span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-slate-400 transition-transform duration-200 flex-shrink-0',
                    isOpen && 'rotate-180'
                  )}
                  aria-hidden="true"
                />
              </div>
            </button>
          </Collapsible.Trigger>

          <Collapsible.Content
            id={`week-${week.week}-awaiting-content`}
            className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up"
          >
            <div className="border-t border-slate-700">
              <div className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  <TeamList label="Team A" players={week.teamA} team="A" />
                  <TeamList label="Team B" players={week.teamB} team="B" />
                </div>
                {isAdmin && (
                  <div className="border-t border-slate-700 mt-4 pt-4 flex justify-end gap-2">
                    <EditResultButton onClick={() => setShowEditModal(true)} />
                    <button
                      onClick={() => setShowResultModal(true)}
                      className="px-4 py-2 rounded-md bg-slate-100 text-slate-900 text-sm font-semibold hover:bg-white transition-colors"
                    >
                      Record Result
                    </button>
                  </div>
                )}
              </div>
            </div>
          </Collapsible.Content>
        </div>
      </Collapsible.Root>

      {showResultModal && (
        <ResultModal
          scheduledWeek={scheduledWeek}
          lineupMetadata={week.lineupMetadata ?? null}
          allPlayers={allPlayers}
          gameId={gameId}
          publicMode={false}
          onSaved={() => {
            setShowResultModal(false)
            onResultSaved()
          }}
          onClose={() => setShowResultModal(false)}
        />
      )}
      {showEditModal && (
        <EditWeekModal
          week={week}
          gameId={gameId}
          allPlayers={allPlayers}
          onSaved={() => { setShowEditModal(false); onResultSaved() }}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </>
  )
}

// ── PlayedCard ────────────────────────────────────────────────────────────────

function PlayedCard({
  week,
  isOpen,
  onToggle,
  goalkeepers,
  isAdmin,
  gameId,
  allPlayers,
  onResultSaved,
}: MatchCardProps) {
  const [showEditModal, setShowEditModal] = useState(false)

  return (
    <>
      <Collapsible.Root open={isOpen} onOpenChange={onToggle}>
        <div
          className={cn(
            'rounded-lg border bg-slate-800 transition-colors duration-150',
            isOpen ? 'border-slate-600' : 'border-slate-700 hover:border-slate-500'
          )}
        >
          <Collapsible.Trigger asChild>
            <button
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer"
              aria-expanded={isOpen}
              aria-controls={`week-${week.week}-content`}
            >
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-100">Week {week.week}</p>
                <p className="text-xs text-slate-400">
                  {week.date}
                  {week.format && (
                    <span className="ml-2 text-slate-400">· {week.format}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <WinnerBadge winner={week.winner} />
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-slate-400 transition-transform duration-200 flex-shrink-0',
                    isOpen && 'rotate-180'
                  )}
                  aria-hidden="true"
                />
              </div>
            </button>
          </Collapsible.Trigger>

          <Collapsible.Content
            id={`week-${week.week}-content`}
            className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up"
          >
            <div className="border-t border-slate-700">
              <div className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  <TeamList
                    label="Team A"
                    players={week.teamA}
                    team="A"
                    rating={week.team_a_rating}
                    goalkeepers={goalkeepers}
                  />
                  <TeamList
                    label="Team B"
                    players={week.teamB}
                    team="B"
                    rating={week.team_b_rating}
                    goalkeepers={goalkeepers}
                  />
                </div>

                {shouldShowMeta(week.goal_difference, week.notes) && (
                  <>
                    <div className="border-t border-slate-700 mt-3" />
                    <div className="flex flex-wrap gap-2 mt-3">
                      {week.goal_difference != null && week.goal_difference !== 0 && (
                        <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-400 italic">
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide not-italic mr-1">
                            Margin
                          </span>
                          +{week.goal_difference} goals
                        </div>
                      )}
                      {week.notes && week.notes.trim() !== '' && (
                        <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-400 italic">
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide not-italic mr-1">
                            Notes
                          </span>
                          {week.notes}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {isAdmin && (
                  <div className="border-t border-slate-700 mt-4 pt-4 flex justify-end">
                    <EditResultButton onClick={() => setShowEditModal(true)} />
                  </div>
                )}
              </div>
            </div>
          </Collapsible.Content>
        </div>
      </Collapsible.Root>

      {showEditModal && (
        <EditWeekModal
          week={week}
          gameId={gameId ?? ''}
          allPlayers={allPlayers ?? []}
          onSaved={() => { setShowEditModal(false); onResultSaved?.() }}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </>
  )
}

// ── MatchCard (public export) ─────────────────────────────────────────────────

export function MatchCard({
  week,
  isOpen,
  onToggle,
  goalkeepers,
  isAdmin = false,
  gameId = '',
  allPlayers = [],
  onResultSaved = () => {},
}: MatchCardProps) {
  if (week.status === 'cancelled') {
    return (
      <CancelledCard
        week={week}
        isAdmin={isAdmin}
        gameId={gameId}
        allPlayers={allPlayers}
        onResultSaved={onResultSaved}
      />
    )
  }
  if (week.status === 'unrecorded') {
    return (
      <UnrecordedCard
        week={week}
        isAdmin={isAdmin}
        gameId={gameId}
        allPlayers={allPlayers}
        onResultSaved={onResultSaved}
      />
    )
  }
  if (week.status === 'scheduled' && !isPastDeadline(week.date)) return null
  if (week.status === 'scheduled' && isPastDeadline(week.date)) {
    return (
      <AwaitingResultCard
        week={week}
        isOpen={isOpen}
        onToggle={onToggle}
        isAdmin={isAdmin}
        gameId={gameId}
        allPlayers={allPlayers}
        onResultSaved={onResultSaved}
      />
    )
  }
  return (
    <PlayedCard
      week={week}
      isOpen={isOpen}
      onToggle={onToggle}
      goalkeepers={goalkeepers}
      isAdmin={isAdmin}
      gameId={gameId}
      allPlayers={allPlayers}
      onResultSaved={onResultSaved}
    />
  )
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Start the dev server and open the results page as an admin**

```bash
npm run dev
```

Navigate to a league's results page logged in as admin.

- [ ] **Step 4: Verify cancelled cards show the edit icon**

Expected: each cancelled week card has a small pencil icon to the right of the "Cancelled" badge. Clicking it opens the `EditWeekModal` prefilled with the week's date and status set to "Cancelled".

- [ ] **Step 5: Verify unrecorded cards show the edit icon**

Expected: same behaviour on unrecorded cards — pencil icon appears, modal opens with status "Unrecorded".

- [ ] **Step 6: Verify played cards show the Edit result button when expanded**

Expand a played week card. Expected: "Edit result" button appears in the card footer. Clicking it opens the modal with all fields pre-populated — date, status "Played", winner, margin, lineups, notes.

- [ ] **Step 7: Verify awaiting result cards show both buttons when expanded**

Expand an awaiting result card. Expected: both "Edit result" and "Record Result" buttons appear side by side in the footer.

- [ ] **Step 8: Verify edit modal opens with status "Played" for awaiting result cards**

The awaiting result card has `status === 'scheduled'` in the DB. Expected: the modal defaults the status dropdown to "Played" (not "Scheduled", which is not an option).

- [ ] **Step 9: Test a full edit on a played week**

Open a played week, change the winner, adjust the margin, modify a lineup (remove a player, add from roster), change the notes. Click Save. Expected: the page refreshes, the card shows the updated winner badge, and the lineup/notes are changed.

- [ ] **Step 10: Test the clear warning**

Open a played week's edit modal. Change status to "Cancelled". Expected: amber warning text appears: "This will clear the recorded result and lineups." Save — the card now renders as a cancelled card.

- [ ] **Step 11: Test converting cancelled → played**

Open a cancelled week's edit modal. Change status to "Played". Expected: result, margin, and lineup fields appear. Fill them in and save. The card now renders as a played card with the correct result.

- [ ] **Step 12: Verify no edit controls appear for non-admin members**

Log out and log back in as a regular member. Expected: no pencil icons on cancelled/unrecorded cards, no "Edit result" button in expanded played/awaiting result cards.

- [ ] **Step 13: Commit**

```bash
git add components/MatchCard.tsx
git commit -m "feat: wire edit entry points into all MatchCard states"
```

---

## Done

All four tasks complete. The feature is fully implemented:

- Admin sees `✏️` on cancelled and unrecorded cards
- Admin sees "Edit result" in the body of played and awaiting-result cards
- `EditWeekModal` handles all status conversions, lineup editing, and field updates
- `edit_week` RPC applies changes atomically and always clears stale team ratings
- Player stats, league tables, and form update automatically on next page load
