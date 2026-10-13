# Edit Player from the Players Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins edit a player's name, strength, mentality and member link, or delete them, from a modal opened by a full-width "Edit player" button on an open player card on the Players tab.

**Architecture:** `PlayerCard` gains an optional `onEdit` prop that renders the button. `PublicPlayerList` (client) owns which player is being edited, lazily fetches the admin roster from the existing `GET /api/league/[id]/players`, and renders a new `EditPlayerModal`. The modal is a Save/Cancel form that calls the existing PATCH, assign, rename and DELETE routes in that order, then the list calls `router.refresh()`. No API, RPC or migration changes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Radix Dialog, Jest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-13-edit-player-from-players-tab-design.md`

**Conventions to follow (from `CLAUDE.md`):** Tailwind arbitrary hex colours only, `cn()` for conditional classes, British English, no em dashes in UI copy, labels written in normal case and uppercased with `uppercase`.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `components/ui/MentalityControl.tsx` | Create | GK · DEF · BAL · ATT segmented control, shared by Settings and the modal |
| `components/PlayerRosterPanel.tsx` | Modify | Import `MentalityControl` instead of its private copy |
| `components/PlayerCard.tsx` | Modify | Optional `onEdit` renders the full-width "Edit player" button in the open card |
| `components/EditPlayerModal.tsx` | Create | The edit form, save sequencing, delete confirmation |
| `components/PublicPlayerList.tsx` | Modify | Editing state, lazy roster fetch, renders the modal, refreshes after writes |
| `app/[slug]/(tabs)/players/page.tsx` | Modify | Pass `leagueId` and `isAdmin` to `PublicPlayerList` |
| `components/__tests__/MentalityControl.test.tsx` | Create | Control behaviour |
| `components/__tests__/PlayerCard.edit.test.tsx` | Create | Button visibility and click |
| `components/__tests__/EditPlayerModal.test.tsx` | Create | Form, save order, errors, delete |
| `components/__tests__/PublicPlayerList.edit.test.tsx` | Create | Admin wiring end to end |

Run single test files with: `npm test -- <path>`

---

### Task 1: Extract `MentalityControl` into a shared component

**Files:**
- Create: `components/ui/MentalityControl.tsx`
- Modify: `components/PlayerRosterPanel.tsx` (remove `MENTALITY_LABELS` at lines 16-21 and the `MentalityControl` function at the bottom of the file; add an import)
- Test: `components/__tests__/MentalityControl.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/MentalityControl.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MentalityControl } from '@/components/ui/MentalityControl'

describe('MentalityControl', () => {
  it('marks the current mentality as pressed', () => {
    render(<MentalityControl value="attacking" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'ATT' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'GK' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onChange only when a different mentality is picked', () => {
    const onChange = jest.fn()
    render(<MentalityControl value="attacking" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'ATT' }))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'DEF' }))
    expect(onChange).toHaveBeenCalledWith('defensive')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- components/__tests__/MentalityControl.test.tsx`
Expected: FAIL, "Cannot find module '@/components/ui/MentalityControl'"

- [ ] **Step 3: Create the component**

Create `components/ui/MentalityControl.tsx`. This is the function from `PlayerRosterPanel.tsx` moved as-is, plus `type="button"` (so it never submits a form) and `aria-pressed`:

```tsx
'use client'

import { cn } from '@/lib/utils'
import type { Mentality } from '@/lib/types'

const OPTIONS: { value: Mentality; label: string }[] = [
  { value: 'goalkeeper', label: 'GK' },
  { value: 'defensive',  label: 'DEF' },
  { value: 'balanced',   label: 'BAL' },
  { value: 'attacking',  label: 'ATT' },
]

interface Props {
  value: Mentality
  onChange: (m: Mentality) => void
  fullWidth?: boolean
}

export function MentalityControl({ value, onChange, fullWidth = false }: Props) {
  return (
    <div
      className={cn(
        'flex border border-[#223a5c] rounded overflow-hidden font-plex text-[9px] font-bold uppercase tracking-[.12em]',
        fullWidth && 'w-full'
      )}
    >
      {OPTIONS.map(({ value: v, label }, i) => (
        <button
          key={v}
          type="button"
          aria-pressed={v === value}
          onClick={() => { if (v !== value) onChange(v) }}
          className={cn(
            'transition-colors border-[#223a5c]',
            fullWidth ? 'flex-1 h-8' : 'h-6 px-2',
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

- [ ] **Step 4: Point `PlayerRosterPanel` at the shared component**

In `components/PlayerRosterPanel.tsx`:

1. Delete the `MENTALITY_LABELS` constant (the `{ value: Mentality; label: string }[]` array). Keep `MENTALITY_DISPLAY`, which is still used for the collapsed-row badge.
2. Delete the whole `function MentalityControl({ ... }) { ... }` at the bottom of the file.
3. Add this import below the `StrengthPills` import:

```tsx
import { MentalityControl } from '@/components/ui/MentalityControl'
```

The existing call site (`<MentalityControl value={player.mentality} onChange={...} fullWidth />`) stays unchanged.

- [ ] **Step 5: Run the new and existing tests**

Run: `npm test -- components/__tests__/MentalityControl.test.tsx components/__tests__/PlayerRosterPanel.delete.test.tsx`
Expected: PASS (all tests in both files)

- [ ] **Step 6: Commit**

```bash
git add components/ui/MentalityControl.tsx components/PlayerRosterPanel.tsx components/__tests__/MentalityControl.test.tsx
git commit -m "Move MentalityControl into a shared component"
```

---

### Task 2: "Edit player" button on the open player card

**Files:**
- Modify: `components/PlayerCard.tsx` (props interface near line 12, lucide import at line 4, new section after the teammates section near line 350)
- Test: `components/__tests__/PlayerCard.edit.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/PlayerCard.edit.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlayerCard } from '@/components/PlayerCard'
import type { Player } from '@/lib/types'

const player: Player = {
  playerId: 'roster|Sam',
  name: 'Sam',
  played: 10,
  won: 5,
  drew: 2,
  lost: 3,
  timesTeamA: 5,
  timesTeamB: 5,
  winRate: 50,
  qualified: true,
  points: 17,
  mentality: 'attacking',
  strength: null,
  recentForm: 'WWLDW',
}

describe('PlayerCard edit button', () => {
  it('shows Edit player on an open card when onEdit is given', () => {
    const onEdit = jest.fn()
    const onToggle = jest.fn()
    render(<PlayerCard player={player} isOpen onToggle={onToggle} sortBy="won" onEdit={onEdit} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit player' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('has no Edit player button without onEdit', () => {
    render(<PlayerCard player={player} isOpen onToggle={() => {}} sortBy="won" />)
    expect(screen.queryByRole('button', { name: 'Edit player' })).not.toBeInTheDocument()
  })

  it('has no Edit player button while the card is closed', () => {
    render(<PlayerCard player={player} isOpen={false} onToggle={() => {}} sortBy="won" onEdit={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Edit player' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- components/__tests__/PlayerCard.edit.test.tsx`
Expected: FAIL on the first test, "Unable to find an accessible element with the role "button" and name "Edit player"" (TypeScript may also flag `onEdit` as an unknown prop).

- [ ] **Step 3: Add the prop and the button**

In `components/PlayerCard.tsx`:

1. Change the lucide import to:

```tsx
import { ChevronDown, Pencil } from 'lucide-react'
```

2. Add to `PlayerCardProps`, after `weeks?`:

```tsx
  /** Admin only: shows an Edit player button at the foot of the open card */
  onEdit?: () => void
```

3. Add `onEdit,` to the destructured props in the function signature (after `weeks,`).

4. Immediately after the closing `)}` of the `{/* ── Section 4: Win % with teammates ── */}` block, and before the closing `</div>` of the `px-[18px] py-4 flex flex-col gap-4` wrapper, add:

```tsx
            {/* ── Admin: edit player ── */}
            {onEdit && (
              <div className="border-t border-[#1b2c46] pt-3.5">
                <button
                  type="button"
                  onClick={onEdit}
                  className="h-9 w-full inline-flex items-center justify-center gap-2 rounded border border-[#223a5c] text-[13px] font-bold text-[#cfe0f4] hover:border-[#38bdf8] hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                  Edit player
                </button>
              </div>
            )}
```

The button is inside `Collapsible.Content`, not the header, so clicking it does not toggle the card.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- components/__tests__/PlayerCard.edit.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add components/PlayerCard.tsx components/__tests__/PlayerCard.edit.test.tsx
git commit -m "Add an optional Edit player button to the open player card"
```

---

### Task 3: `EditPlayerModal`

**Files:**
- Create: `components/EditPlayerModal.tsx`
- Test: `components/__tests__/EditPlayerModal.test.tsx`

Behaviour summary (from the spec):
- Loading skeleton while `roster` is `null`; error with Retry when `rosterError`; a short message if the player isn't on the roster.
- Fields: Name (labelled input), Strength (`StrengthPills`, only while `played < 10`, with the "no longer used after N more games" hint), Mentality (`MentalityControl`), Member link (lime chip, or "+ Link member" opening `MemberLinkPicker` inline; the choice is staged until Save).
- Save is disabled when nothing changed, the name is blank, or it matches another player's name (case-insensitive, shows "Another player already has that name").
- Save order: attributes PATCH (old name) → assign POST (old name) → rename PATCH. Stop at the first failure, show its error, keep the modal open. Report whatever did save through `onUpdated(previousName, updated)`. On full success, `onUpdated` then `onClose`.
- Delete swaps the modal to "Delete {name}?" with Cancel (back to the form, edits kept) and "Delete player" (DELETE, then `onDeleted(name)`).
- Closing (X, Escape, overlay) is blocked while a request is in flight.

- [ ] **Step 1: Write the failing tests**

Create `components/__tests__/EditPlayerModal.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EditPlayerModal } from '@/components/EditPlayerModal'
import type { PlayerAttribute } from '@/lib/types'

function makePlayer(name: string, overrides: Partial<PlayerAttribute> = {}): PlayerAttribute {
  return {
    name,
    strength: null,
    mentality: 'balanced',
    played: 0,
    linked_user_id: null,
    linked_display_name: null,
    ...overrides,
  }
}

const fetchMock = jest.fn()

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

const ok = () => ({ ok: true, json: async () => ({}) })
const fail = (error: string) => ({ ok: false, json: async () => ({ error }) })

type ModalProps = React.ComponentProps<typeof EditPlayerModal>

function renderModal(overrides: Partial<ModalProps> = {}) {
  const props: ModalProps = {
    leagueId: 'league-1',
    playerName: 'Sam',
    roster: [
      makePlayer('Sam', { played: 6, strength: 'average', mentality: 'attacking' }),
      makePlayer('Alex'),
    ],
    rosterError: false,
    onRetry: jest.fn(),
    onUpdated: jest.fn(),
    onDeleted: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  }
  render(<EditPlayerModal {...props} />)
  return props
}

describe('EditPlayerModal', () => {
  it('shows a loading state until the roster arrives', () => {
    renderModal({ roster: null })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
  })

  it('offers a retry when the roster fails to load', () => {
    const props = renderModal({ roster: null, rosterError: true })
    expect(screen.getByText("Couldn't load player details.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(props.onRetry).toHaveBeenCalled()
  })

  it('fills the form from the roster', () => {
    renderModal()
    expect(screen.getByLabelText('Name')).toHaveValue('Sam')
    expect(screen.getByRole('button', { name: 'ATT' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('radio', { name: 'Average' })).toHaveAttribute('aria-checked', 'true')
  })

  it('shows strength with a countdown under 10 games', () => {
    renderModal()
    expect(screen.getByRole('radiogroup', { name: 'Strength' })).toBeInTheDocument()
    expect(screen.getByText(/no longer used after 4 more games/)).toBeInTheDocument()
  })

  it('hides strength at 10 or more games', () => {
    renderModal({ roster: [makePlayer('Sam', { played: 10 })] })
    expect(screen.queryByRole('radiogroup', { name: 'Strength' })).not.toBeInTheDocument()
  })

  it('disables Save until something changes', () => {
    renderModal()
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'DEF' }))
    expect(save).toBeEnabled()
  })

  it('blocks a blank name and a name another player already has', () => {
    renderModal()
    const input = screen.getByLabelText('Name')

    fireEvent.change(input, { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    fireEvent.change(input, { target: { value: 'alex' } })
    expect(screen.getByText('Another player already has that name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('saves attributes before renaming and sends only what changed', async () => {
    fetchMock.mockResolvedValue(ok())
    const props = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'DEF' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sammy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(props.onClose).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const [patchUrl, patchInit] = fetchMock.mock.calls[0]
    expect(patchUrl).toBe('/api/league/league-1/players/Sam')
    expect(patchInit.method).toBe('PATCH')
    expect(JSON.parse(patchInit.body)).toEqual({ mentality: 'defensive' })

    const [renameUrl, renameInit] = fetchMock.mock.calls[1]
    expect(renameUrl).toBe('/api/league/league-1/players/Sam/rename')
    expect(renameInit.method).toBe('PATCH')
    expect(JSON.parse(renameInit.body)).toEqual({ new_name: 'Sammy' })

    expect(props.onUpdated).toHaveBeenCalledWith(
      'Sam',
      expect.objectContaining({ name: 'Sammy', mentality: 'defensive' }),
    )
  })

  it('keeps the modal open on a failed save and reports what did save', async () => {
    fetchMock
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(fail('Name already exists in this league'))
    const props = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'DEF' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sammy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Name already exists in this league')).toBeInTheDocument()
    expect(props.onClose).not.toHaveBeenCalled()
    expect(props.onUpdated).toHaveBeenCalledWith(
      'Sam',
      expect.objectContaining({ name: 'Sam', mentality: 'defensive' }),
    )
    expect(screen.getByLabelText('Name')).toHaveValue('Sammy')
  })

  it('does not report an update when the first request fails', async () => {
    fetchMock.mockResolvedValueOnce(fail('Player not found'))
    const props = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'DEF' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Player not found')).toBeInTheDocument()
    expect(props.onUpdated).not.toHaveBeenCalled()
  })

  it('stages a member link and only sends it on Save', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/members')
        ? {
            ok: true,
            json: async () => [
              { user_id: 'u2', email: 'jo@example.com', display_name: 'Jo', role: 'member', joined_at: '', linked_player_name: null },
            ],
          }
        : ok(),
    )
    const props = renderModal()
    fireEvent.click(screen.getByRole('button', { name: '+ Link member' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Jo' }))

    expect(screen.getByText('Jo')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1) // just the members list

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(props.onClose).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/league/league-1/player-claims/assign',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ user_id: 'u2', player_name: 'Sam' }),
      }),
    )
    expect(props.onUpdated).toHaveBeenCalledWith(
      'Sam',
      expect.objectContaining({ linked_user_id: 'u2', linked_display_name: 'Jo' }),
    )
  })

  it('asks before deleting, and Cancel returns to the form with edits kept', () => {
    renderModal()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sammy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.getByText('Delete Sam?')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Sammy')
  })

  it('deletes the player', async () => {
    fetchMock.mockResolvedValue(ok())
    const props = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete player' }))

    await waitFor(() => expect(props.onDeleted).toHaveBeenCalledWith('Sam'))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/league/league-1/players/Sam',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('shows the error and stays on the confirmation when a delete fails', async () => {
    fetchMock.mockResolvedValue(fail('Player not found'))
    const props = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete player' }))

    expect(await screen.findByText('Player not found')).toBeInTheDocument()
    expect(screen.getByText('Delete Sam?')).toBeInTheDocument()
    expect(props.onDeleted).not.toHaveBeenCalled()
  })

  it('warns that a linked member will be unlinked', () => {
    renderModal({ roster: [makePlayer('Sam', { linked_user_id: 'u1', linked_display_name: 'Sam O.' })] })
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText(/will be unlinked/)).toHaveTextContent('Sam O. will be unlinked')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- components/__tests__/EditPlayerModal.test.tsx`
Expected: FAIL, "Cannot find module '@/components/EditPlayerModal'"

- [ ] **Step 3: Implement the modal**

Create `components/EditPlayerModal.tsx`:

```tsx
'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { Mentality, PlayerAttribute, Strength } from '@/lib/types'
import { StrengthPills } from '@/components/ui/StrengthPills'
import { MentalityControl } from '@/components/ui/MentalityControl'
import { SkeletonList } from '@/components/ui/skeleton'
import MemberLinkPicker from '@/components/MemberLinkPicker'

/** Strength stops feeding Auto-Pick once a player has this many games. */
const STRENGTH_GAMES = 10

const FIELD_LABEL = 'block font-plex text-[9px] font-bold text-[#6f88a8] uppercase tracking-[.18em] mb-1.5'
const OUTLINE_BTN = 'h-9 px-3.5 rounded border border-[#223a5c] text-[#cfe0f4] text-[13px] font-semibold hover:border-[#38bdf8] hover:text-white transition-colors disabled:opacity-50'
const DESTRUCTIVE_BTN = 'h-9 px-4 rounded border border-[#e2686f]/40 text-[#e2686f] text-[13px] font-bold hover:bg-[#e2686f]/10 transition-colors disabled:opacity-50'
const PRIMARY_BTN = 'h-9 px-4 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-[13px] font-bold transition-colors disabled:opacity-50 disabled:hover:bg-[#38bdf8]'

interface Props {
  leagueId: string
  /** Name of the player being edited. */
  playerName: string
  /** Admin roster with link info, from GET /api/league/[id]/players. null while loading. */
  roster: PlayerAttribute[] | null
  rosterError: boolean
  onRetry: () => void
  /** Called whenever a save writes anything, with the name before the save and the player as now saved. */
  onUpdated: (previousName: string, updated: PlayerAttribute) => void
  onDeleted: (name: string) => void
  onClose: () => void
}

/** Sends a JSON request and throws the API's error message on failure. */
async function send(url: string, method: string, body: unknown, fallback: string) {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? fallback)
  }
}

export function EditPlayerModal({
  leagueId,
  playerName,
  roster,
  rosterError,
  onRetry,
  onUpdated,
  onDeleted,
  onClose,
}: Props) {
  const [busy, setBusy] = useState(false)
  const player = roster?.find((p) => p.name === playerName) ?? null

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-[#030710]/80 z-[999]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] w-full max-w-[calc(100%-32px)] sm:max-w-sm max-h-[calc(100dvh-32px)] overflow-y-auto rounded-[14px] bg-[#0a1421] border border-[#1b2c46] shadow-[0_34px_80px_rgba(0,0,0,.65)] focus:outline-none"
        >
          {roster && player ? (
            <EditPlayerForm
              leagueId={leagueId}
              player={player}
              roster={roster}
              busy={busy}
              setBusy={setBusy}
              onUpdated={onUpdated}
              onDeleted={onDeleted}
              onClose={onClose}
            />
          ) : (
            <>
              <ModalHeader title="Edit player" onClose={onClose} />
              <div className="px-5 py-4">
                {rosterError ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-inter-body text-sm text-[#e2686f]">Couldn&apos;t load player details.</p>
                    <button type="button" onClick={onRetry} className={OUTLINE_BTN}>Retry</button>
                  </div>
                ) : roster ? (
                  <p className="font-inter-body text-sm text-[#8ba4c4]">This player isn&apos;t on the roster any more.</p>
                ) : (
                  <SkeletonList rows={4} />
                )}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ModalHeader({ title, onClose, disabled = false }: { title: string; onClose: () => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-[#1b2c46]">
      <Dialog.Title className="text-base font-semibold text-[#f4f9ff]">{title}</Dialog.Title>
      <button
        type="button"
        onClick={onClose}
        disabled={disabled}
        aria-label="Close"
        className="inline-flex size-7 items-center justify-center rounded text-[#8ba4c4] hover:text-[#f4f9ff] disabled:opacity-50 transition-colors"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  )
}

interface FormProps {
  leagueId: string
  player: PlayerAttribute
  roster: PlayerAttribute[]
  busy: boolean
  setBusy: (busy: boolean) => void
  onUpdated: Props['onUpdated']
  onDeleted: Props['onDeleted']
  onClose: () => void
}

function EditPlayerForm({ leagueId, player, roster, busy, setBusy, onUpdated, onDeleted, onClose }: FormProps) {
  // Draft values. `player` is the saved baseline; it moves when the parent
  // updates the roster after a (partial) save, while these keep the admin's input.
  const [name, setName] = useState(player.name)
  const [strength, setStrength] = useState<Strength | null>(player.strength)
  const [mentality, setMentality] = useState<Mentality>(player.mentality)
  const [stagedLink, setStagedLink] = useState<{ userId: string; displayName: string } | null>(null)
  const [pickingMember, setPickingMember] = useState(false)
  const [view, setView] = useState<'form' | 'delete'>('form')
  const [error, setError] = useState<string | null>(null)

  const gamesLeft = STRENGTH_GAMES - (player.played ?? 0)
  const showStrength = gamesLeft > 0
  const trimmed = name.trim()
  const renamed = trimmed !== player.name
  const nameTaken =
    renamed &&
    roster.some((p) => p.name !== player.name && p.name.toLowerCase() === trimmed.toLowerCase())
  const strengthChanged = showStrength && strength !== null && strength !== player.strength
  const mentalityChanged = mentality !== player.mentality
  const dirty = renamed || strengthChanged || mentalityChanged || stagedLink !== null
  const canSave = dirty && trimmed.length > 0 && !nameTaken && !busy
  const linkedName = stagedLink?.displayName ?? player.linked_display_name ?? null
  const playerUrl = `/api/league/${leagueId}/players/${encodeURIComponent(player.name)}`

  async function handleSave() {
    if (!canSave) return
    setBusy(true)
    setError(null)
    // What the server holds so far; grows as each step succeeds
    let saved: PlayerAttribute = player
    try {
      const patch: { strength?: Strength; mentality?: Mentality } = {}
      if (strengthChanged && strength) patch.strength = strength
      if (mentalityChanged) patch.mentality = mentality
      if (Object.keys(patch).length > 0) {
        await send(playerUrl, 'PATCH', patch, 'Failed to save changes')
        saved = { ...saved, ...patch }
      }

      if (stagedLink) {
        await send(
          `/api/league/${leagueId}/player-claims/assign`,
          'POST',
          { user_id: stagedLink.userId, player_name: player.name },
          'Failed to link member',
        )
        saved = { ...saved, linked_user_id: stagedLink.userId, linked_display_name: stagedLink.displayName }
        setStagedLink(null)
      }

      // Rename last so the steps above always address a name that exists
      if (renamed) {
        await send(`${playerUrl}/rename`, 'PATCH', { new_name: trimmed }, 'Failed to rename')
        saved = { ...saved, name: trimmed }
      }

      onUpdated(player.name, saved)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      if (saved !== player) onUpdated(player.name, saved)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      await send(playerUrl, 'DELETE', undefined, 'Failed to delete')
      onDeleted(player.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  if (view === 'delete') {
    return (
      <div className="p-5">
        <Dialog.Title className="text-base font-bold tracking-[-.02em] text-[#f4f9ff] mb-2.5">
          Delete {player.name}?
        </Dialog.Title>
        <p className="font-inter-body text-[13px] leading-[1.55] text-[#8ba4c4] mb-5">
          They&apos;ll be removed from the roster, the Players tab and the team builder. Past match line-ups keep their name.
          {player.linked_display_name && (
            <> <span className="text-[#f4f9ff] font-semibold">{player.linked_display_name}</span> will be unlinked.</>
          )}
          {' '}This can&apos;t be undone.
        </p>
        {error && <p className="font-inter-body text-xs text-[#e2686f] mb-4">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => { setView('form'); setError(null) }}
            disabled={busy}
            className={OUTLINE_BTN}
          >
            Cancel
          </button>
          <button type="button" onClick={handleDelete} disabled={busy} className={DESTRUCTIVE_BTN}>
            {busy ? 'Deleting…' : 'Delete player'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <ModalHeader title="Edit player" onClose={onClose} disabled={busy} />

      <div className="px-5 py-4 flex flex-col gap-4">
        <div>
          <label htmlFor="edit-player-name" className={FIELD_LABEL}>Name</label>
          <input
            id="edit-player-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            disabled={busy}
            autoComplete="off"
            className="h-9 w-full rounded border border-[#223a5c] bg-[#0c1728] px-3 font-inter-body text-sm text-[#f4f9ff] focus:outline-none focus:ring-0 focus:border-[#38bdf8] disabled:opacity-50"
          />
          {nameTaken && (
            <p className="mt-1.5 font-inter-body text-xs text-[#e2686f]">Another player already has that name</p>
          )}
        </div>

        {showStrength && (
          <div>
            <p className={FIELD_LABEL}>
              Strength
              <span className="ml-1.5 text-[#4f688a]">
                · no longer used after {gamesLeft} more {gamesLeft === 1 ? 'game' : 'games'}
              </span>
            </p>
            <StrengthPills value={strength} onChange={setStrength} disabled={busy} />
          </div>
        )}

        <div>
          <p className={FIELD_LABEL}>Mentality</p>
          <MentalityControl value={mentality} onChange={setMentality} fullWidth />
        </div>

        <div>
          <p className={FIELD_LABEL}>Member link</p>
          {linkedName ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border bg-[#bef264]/8 text-[#bef264] border-[#bef264]/35">
              <span className="size-1.5 rounded-full bg-[#bef264] shrink-0" />
              {linkedName}
            </span>
          ) : pickingMember ? (
            <div className="overflow-hidden rounded border border-[#1b2c46] [&>div]:border-t-0">
              <MemberLinkPicker
                leagueId={leagueId}
                onLink={(userId, displayName) => {
                  setStagedLink({ userId, displayName })
                  setPickingMember(false)
                }}
                onCancel={() => setPickingMember(false)}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPickingMember(true)}
              disabled={busy}
              className="text-xs text-[#6f88a8] border border-dashed border-[#223a5c] px-2 py-0.5 rounded hover:border-[#3d5578] hover:text-[#cfe0f4] transition-colors"
            >
              + Link member
            </button>
          )}
        </div>

        {error && <p className="font-inter-body text-xs text-[#e2686f]">{error}</p>}
      </div>

      <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-[#1b2c46]">
        <button
          type="button"
          onClick={() => { setView('delete'); setError(null) }}
          disabled={busy}
          className={DESTRUCTIVE_BTN}
        >
          Delete
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={OUTLINE_BTN}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={!canSave} className={PRIMARY_BTN}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- components/__tests__/EditPlayerModal.test.tsx`
Expected: PASS (all tests)

If the "Jo" assertions find two matches (picker button and chip), the picker has not closed after `onLink`; check `setPickingMember(false)` runs.

- [ ] **Step 5: Commit**

```bash
git add components/EditPlayerModal.tsx components/__tests__/EditPlayerModal.test.tsx
git commit -m "Add an Edit player modal with save and delete"
```

---

### Task 4: Wire the modal into the Players tab

**Files:**
- Modify: `components/PublicPlayerList.tsx`
- Modify: `app/[slug]/(tabs)/players/page.tsx:63-68`
- Test: `components/__tests__/PublicPlayerList.edit.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `components/__tests__/PublicPlayerList.edit.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PublicPlayerList } from '@/components/PublicPlayerList'
import type { Player, PlayerAttribute } from '@/lib/types'

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

function makePlayer(name: string, won: number): Player {
  return {
    playerId: `roster|${name}`,
    name,
    played: 10,
    won,
    drew: 0,
    lost: 10 - won,
    timesTeamA: 5,
    timesTeamB: 5,
    winRate: won * 10,
    qualified: true,
    points: won * 3,
    mentality: 'balanced',
    strength: null,
    recentForm: 'WWLDW',
  }
}

// Sam has the most wins, so his card is open on first render
const players = [makePlayer('Sam', 6), makePlayer('Alex', 3)]

const roster: PlayerAttribute[] = [
  { name: 'Alex', strength: null, mentality: 'balanced', played: 10, linked_user_id: null, linked_display_name: null },
  { name: 'Sam', strength: null, mentality: 'balanced', played: 10, linked_user_id: null, linked_display_name: null },
]

const fetchMock = jest.fn()

beforeEach(() => {
  fetchMock.mockReset()
  mockRefresh.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

function mockApi() {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
    url === '/api/league/league-1/players' && !init?.method
      ? { ok: true, json: async () => roster }
      : { ok: true, json: async () => ({}) },
  )
}

describe('PublicPlayerList editing', () => {
  it('shows no Edit player button to non-admins', () => {
    render(<PublicPlayerList leagueId="league-1" players={players} />)
    expect(screen.getByText('Sam')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit player' })).not.toBeInTheDocument()
  })

  it('opens the modal for the open card and loads the roster once', async () => {
    mockApi()
    render(<PublicPlayerList leagueId="league-1" isAdmin players={players} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit player' }))
    expect(await screen.findByLabelText('Name')).toHaveValue('Sam')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Edit player' }))
    expect(await screen.findByLabelText('Name')).toHaveValue('Sam')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refreshes the page and closes the modal after saving', async () => {
    mockApi()
    render(<PublicPlayerList leagueId="league-1" isAdmin players={players} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit player' }))
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Sammy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('refreshes the page after deleting', async () => {
    mockApi()
    render(<PublicPlayerList leagueId="league-1" isAdmin players={players} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit player' }))
    await screen.findByLabelText('Name')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete player' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockRefresh).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- components/__tests__/PublicPlayerList.edit.test.tsx`
Expected: FAIL. The first test may pass already; the admin tests fail with "Unable to find an accessible element with the role "button" and name "Edit player"".

- [ ] **Step 3: Add editing to `PublicPlayerList`**

In `components/PublicPlayerList.tsx`:

1. Replace the imports at the top with:

```tsx
'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PlayerCard } from '@/components/PlayerCard'
import { EditPlayerModal } from '@/components/EditPlayerModal'
import type { Player, PlayerAttribute, SortKey, Week } from '@/lib/types'
```

2. Replace the `Props` interface with:

```tsx
interface Props {
  leagueId: string
  players: Player[]
  visibleStats?: string[]
  showMentality?: boolean
  weeks?: Week[]
  /** Admins get an Edit player button on each open card */
  isAdmin?: boolean
}
```

3. Change the function signature to:

```tsx
export function PublicPlayerList({ leagueId, players, visibleStats, showMentality = true, weeks, isAdmin = false }: Props) {
```

4. Directly after the existing `const [sortVersion, setSortVersion] = useState(0)` line, add:

```tsx
  const router = useRouter()
  // Admin editing. The roster (with member links) loads on first open and is reused.
  const [editingPlayer, setEditingPlayer] = useState<string | null>(null)
  const [roster, setRoster]               = useState<PlayerAttribute[] | null>(null)
  const [rosterError, setRosterError]     = useState(false)

  const loadRoster = useCallback(async () => {
    setRosterError(false)
    try {
      const res = await fetch(`/api/league/${leagueId}/players`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to load roster')
      setRoster(await res.json())
    } catch {
      setRosterError(true)
    }
  }, [leagueId])

  function openEditor(name: string) {
    setEditingPlayer(name)
    if (!roster) loadRoster()
  }

  function handlePlayerUpdated(previousName: string, updated: PlayerAttribute) {
    setRoster((prev) => prev?.map((p) => (p.name === previousName ? updated : p)) ?? prev)
    if (updated.name !== previousName) {
      setEditingPlayer((cur) => (cur === previousName ? updated.name : cur))
      setOpenPlayer((cur) => (cur === previousName ? updated.name : cur))
    }
    router.refresh()
  }

  function handlePlayerDeleted(name: string) {
    setRoster((prev) => prev?.filter((p) => p.name !== name) ?? prev)
    setEditingPlayer(null)
    router.refresh()
  }
```

5. In the `displayed.map(...)` `<PlayerCard ... />`, add this prop after `weeks={weeks}`:

```tsx
              onEdit={isAdmin ? () => openEditor(player.name) : undefined}
```

6. Just before the final closing `</div>` of the component's returned JSX (after the player cards conditional), add:

```tsx
      {isAdmin && editingPlayer && (
        <EditPlayerModal
          leagueId={leagueId}
          playerName={editingPlayer}
          roster={roster}
          rosterError={rosterError}
          onRetry={loadRoster}
          onUpdated={handlePlayerUpdated}
          onDeleted={handlePlayerDeleted}
          onClose={() => setEditingPlayer(null)}
        />
      )}
```

- [ ] **Step 4: Pass `leagueId` and `isAdmin` from the page**

In `app/[slug]/(tabs)/players/page.tsx`, replace the `<PublicPlayerList ... />` element with:

```tsx
      <PublicPlayerList
        leagueId={leagueId}
        isAdmin={isAdmin}
        players={players}
        visibleStats={visibleStats}
        showMentality={showMentality}
        weeks={weeks}
      />
```

(`leagueId` and `isAdmin` are already defined earlier in the page.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- components/__tests__/PublicPlayerList.edit.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add components/PublicPlayerList.tsx "app/[slug]/(tabs)/players/page.tsx" components/__tests__/PublicPlayerList.edit.test.tsx
git commit -m "Let admins edit players from the Players tab"
```

---

### Task 5: Full verification

**Files:** none

- [ ] **Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: no output, exit code 0.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors, and no new warnings in the files this plan touches. Warnings in other files predate this branch and can be ignored.

- [ ] **Step 3: Full test suite**

Run: `npm test`
Expected: all suites pass.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build completes without type or compile errors.

- [ ] **Step 5: Manual check (needs the user)**

Local dev points at the production Supabase project, so do not save, rename or delete from a local session. Ask the user to check on a preview deploy, signed in as an admin:
- Players tab: the open card shows the full-width "Edit player" button; signed out or as a member, it does not.
- The modal opens with the player's current values; Save stays disabled until something changes.
- Delete shows the confirmation and Cancel returns to the form.
