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
      if (saved !== player) {
        // Once the link is saved the chip comes from the baseline, so drop the staged copy
        if (saved.linked_user_id !== player.linked_user_id) setStagedLink(null)
        onUpdated(player.name, saved)
      }
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
            autoFocus
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
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSave() }}
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
          <MentalityControl value={mentality} onChange={setMentality} fullWidth disabled={busy} />
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
                submitting={busy}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPickingMember(true)}
              disabled={busy}
              className="text-xs text-[#6f88a8] border border-dashed border-[#223a5c] px-2 py-0.5 rounded hover:border-[#3d5578] hover:text-[#cfe0f4] transition-colors disabled:opacity-50"
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
