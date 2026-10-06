'use client'

import * as Collapsible from '@radix-ui/react-collapsible'
import { Check, CheckCheck, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoney, longWeekDate } from '@/lib/fees'
import { MoneyGroup, plural } from '@/components/admin/MoneyGroup'
import type { FeeEntry, PlayerBalance } from '@/lib/types'

const COLLAPSIBLE_CONTENT =
  'overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up'
const ROW_TRIGGER =
  'w-full flex items-center gap-3 px-3.5 text-left transition-colors hover:bg-[#0c1728] data-[state=open]:bg-[#0c1728] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#38bdf8]'

interface BalanceListProps {
  players: PlayerBalance[]
  openName: string | null
  onOpenChange: (name: string | null) => void
  onToggleEntry: (entry: FeeEntry) => void
}

// ── Entry rows ────────────────────────────────────────────────────────────────

/** One game (or a guest's game) with its cost and a paid tick. Clicking toggles it. */
function EntryRow({ entry, muted, onToggle }: { entry: FeeEntry; muted: boolean; onToggle: () => void }) {
  const { paid } = entry
  const dateLabel = longWeekDate(entry.date) + (entry.guest ? '  +1' : '')
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={paid}
      aria-label={`${dateLabel}${entry.guest ? ' guest' : ''}, ${formatMoney(entry.cost)}, ${paid ? 'paid' : 'unpaid'}`}
      onClick={onToggle}
      className={cn(
        'flex w-full items-center gap-2.5 rounded px-1 py-1.5 text-left transition-colors hover:bg-[#101d31] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]',
        !paid && 'bg-[#e2686f]/6'
      )}
    >
      <span
        className={cn(
          'min-w-0 flex-1 truncate whitespace-pre font-inter-body text-[13px]',
          paid || muted ? 'font-medium text-[#8ba4c4]' : 'font-bold text-[#f4f9ff]'
        )}
      >
        {dateLabel}
      </span>
      <span className="font-plex text-[9px] uppercase tracking-[.08em] text-[#4f688a]">Week {entry.week}</span>
      <span
        className={cn('w-10 text-right font-plex text-xs font-bold', paid ? 'text-[#6f88a8]' : 'text-[#e2686f]')}
      >
        {formatMoney(entry.cost)}
      </span>
      <span
        aria-hidden
        className={cn(
          'inline-flex size-[22px] shrink-0 items-center justify-center rounded-md border text-[#05101d]',
          paid ? 'border-[#bef264] bg-[#bef264]' : 'border-[#223a5c]'
        )}
      >
        {paid && <Check className="size-[13px]" strokeWidth={3} />}
      </span>
    </button>
  )
}

// ── Who owes ──────────────────────────────────────────────────────────────────

function guestBadge(guests: number): string {
  return guests > 1 ? `+1 × ${guests}` : '+1'
}

function debtorNote(p: PlayerBalance): string {
  const unpaid = p.entries.filter((e) => !e.paid)
  const unpaidGames = unpaid.filter((e) => !e.guest).length
  const unpaidGuests = unpaid.length - unpaidGames
  const parts = [`${unpaidGames} of ${plural(p.games, 'game')} unpaid`]
  if (unpaidGuests > 0) parts.push(plural(unpaidGuests, 'guest'))
  return parts.join(' · ')
}

export function WhoOwes({
  players,
  totalOwed,
  openName,
  onOpenChange,
  onToggleEntry,
  onSettle,
}: BalanceListProps & { totalOwed: number; onSettle: (player: PlayerBalance) => void }) {
  return (
    <MoneyGroup
      title="Who owes"
      meta={players.length > 0 ? `${plural(players.length, 'player')} · ${formatMoney(totalOwed)}` : 'Nothing outstanding'}
      footnote="Guests are owed through the player who brought them. Tap a player to tick off individual games."
    >
      {players.length === 0 && (
        <div className="px-3.5 py-[22px] text-center">
          <p className="text-sm font-bold text-[#bef264]">All square</p>
          <p className="mt-[5px] font-plex text-[9px] uppercase tracking-[.12em] text-[#6f88a8]">
            Nobody owes anything in this range
          </p>
        </div>
      )}
      {players.map((p) => {
        const isOpen = openName === p.name
        const unpaid = p.entries.filter((e) => !e.paid)
        return (
          <Collapsible.Root
            key={p.name}
            open={isOpen}
            onOpenChange={(open) => onOpenChange(open ? p.name : null)}
            className="border-t border-[#1b2c46] first:border-t-0"
          >
            <Collapsible.Trigger asChild>
              <button type="button" className={cn(ROW_TRIGGER, 'py-3')}>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-[7px]">
                    <span className="truncate text-sm font-bold tracking-[-.01em] text-[#f4f9ff]">{p.name}</span>
                    {p.guests > 0 && (
                      <span className="shrink-0 rounded border border-[#223a5c] px-[7px] py-[3px] font-plex text-[8px] font-bold leading-none tracking-[.14em] text-[#8ba4c4]">
                        {guestBadge(p.guests)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-plex text-[9px] uppercase tracking-[.1em] text-[#6f88a8]">{debtorNote(p)}</p>
                </div>
                <span className="shrink-0 text-[22px] font-bold tracking-[-.03em] text-[#e2686f] tabular-nums">
                  {formatMoney(p.owed)}
                </span>
                <ChevronDown
                  className={cn(
                    'size-[15px] shrink-0 text-[#6f88a8] transition-transform duration-200',
                    isOpen && 'rotate-180'
                  )}
                />
              </button>
            </Collapsible.Trigger>
            <Collapsible.Content className={COLLAPSIBLE_CONTENT}>
              <div className="border-t border-[#17263c] bg-[#0c1728] px-3.5 pt-1 pb-3">
                <div className="flex justify-between px-1 pt-2 pb-1.5 font-plex text-[8.5px] font-bold uppercase tracking-[.16em] text-[#4f688a]">
                  <span>Games in range</span>
                  <span>Paid</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {p.entries.map((e) => (
                    <EntryRow key={e.key} entry={e} muted={false} onToggle={() => onToggleEntry(e)} />
                  ))}
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2.5 px-1">
                  <p className="font-inter-body text-[11px] leading-normal text-[#6f88a8]">
                    {plural(unpaid.length, 'game')} outstanding · {formatMoney(p.owed)}
                  </p>
                  <button
                    type="button"
                    onClick={() => onSettle(p)}
                    className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded border border-[#bef264]/40 bg-[#bef264]/10 px-3 font-plex text-[9px] font-bold uppercase tracking-[.12em] text-[#bef264] transition-colors hover:bg-[#bef264]/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bef264]"
                  >
                    <CheckCheck className="size-3" strokeWidth={2.5} />
                    Mark all paid
                  </button>
                </div>
              </div>
            </Collapsible.Content>
          </Collapsible.Root>
        )
      })}
    </MoneyGroup>
  )
}

// ── Settled ───────────────────────────────────────────────────────────────────

export function Settled({ players, openName, onOpenChange, onToggleEntry }: BalanceListProps) {
  if (players.length === 0) return null
  return (
    <MoneyGroup title="Settled" meta={plural(players.length, 'player')}>
      {players.map((p) => {
        const isOpen = openName === p.name
        return (
          <Collapsible.Root
            key={p.name}
            open={isOpen}
            onOpenChange={(open) => onOpenChange(open ? p.name : null)}
            className="border-t border-[#17263c] first:border-t-0"
          >
            <Collapsible.Trigger asChild>
              <button type="button" className={cn(ROW_TRIGGER, 'py-2.5')}>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#8ba4c4]">{p.name}</span>
                <span className="font-plex text-[9px] uppercase tracking-[.1em] text-[#4f688a]">
                  {plural(p.games, 'game')}
                </span>
                <span className="inline-flex items-center rounded border border-[#bef264]/30 bg-[#bef264]/7 px-[7px] py-[3px] font-plex text-[8px] font-bold uppercase leading-none tracking-[.14em] text-[#bef264]">
                  Paid
                </span>
                <ChevronDown
                  className={cn(
                    'size-[15px] shrink-0 text-[#4f688a] transition-transform duration-200',
                    isOpen && 'rotate-180'
                  )}
                />
              </button>
            </Collapsible.Trigger>
            <Collapsible.Content className={COLLAPSIBLE_CONTENT}>
              <div className="border-t border-[#17263c] bg-[#0c1728] px-3.5 pt-1 pb-3">
                <div className="mt-1.5 flex flex-col gap-0.5">
                  {p.entries.map((e) => (
                    <EntryRow key={e.key} entry={e} muted onToggle={() => onToggleEntry(e)} />
                  ))}
                </div>
                <p className="mx-1 mt-2.5 font-inter-body text-[11px] leading-normal text-[#6f88a8]">
                  Untick a game to move it back to owed.
                </p>
              </div>
            </Collapsible.Content>
          </Collapsible.Root>
        )
      })}
    </MoneyGroup>
  )
}
