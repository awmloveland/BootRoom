'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { parseWeekDate } from '@/lib/utils'
import {
  buildShareText,
  computeFees,
  fromIsoDate,
  isoDate,
  presetSummaries,
  type FeeRangeInput,
  type PaymentMap,
  type WeekFeeMap,
} from '@/lib/fees'
import { SidebarPortal } from '@/components/SidebarSlot'
import { RangeControl } from '@/components/admin/RangeControl'
import { OutstandingCard } from '@/components/admin/OutstandingCard'
import { Settled, WhoOwes } from '@/components/admin/WhoOwes'
import { GamesColumn, GamesWidget } from '@/components/admin/GamesList'
import { SharePreview, ShareSheet } from '@/components/admin/ShareSheet'
import { useOptimisticMap } from '@/components/admin/useOptimisticMap'
import type { FeeEntry, PlayerBalance, Week } from '@/lib/types'

interface AdminMoneyViewProps {
  leagueId: string
  leagueName: string
  /** Played and cancelled weeks; the view filters them to the chosen range. */
  weeks: Week[]
  defaultFee: number
  fees: WeekFeeMap
  payments: PaymentMap
  initialRange: FeeRangeInput
  /** 'YYYY-MM-DD' from the server, so server and client agree on the range. */
  today: string
}

const DEFAULT_FEE_DEBOUNCE_MS = 400
const TOAST_MS = 3000
const SAVE_FAILED = 'Could not save that change. Try again.'

/**
 * The Admin tab's money view. Everything is computed on the client from the
 * league's weeks, fees and payments, so changing the range is instant and
 * every edit (a tick, Mark all paid, a cost) updates the whole page at once.
 * Edits are optimistic: saves run one at a time, a failure reverts its change
 * with a toast, and the page refreshes from the server once the queue drains.
 */
export function AdminMoneyView({
  leagueId,
  leagueName,
  weeks,
  defaultFee: serverDefaultFee,
  fees: serverFees,
  payments: serverPayments,
  initialRange,
  today,
}: AdminMoneyViewProps) {
  const router = useRouter()
  const pathname = usePathname()

  const payments = useOptimisticMap(serverPayments)
  const fees = useOptimisticMap(serverFees)
  const serverDefault = useMemo(() => ({ fee: serverDefaultFee }), [serverDefaultFee])
  const defaultFee = useOptimisticMap(serverDefault)

  const [range, setRange] = useState(initialRange)
  const [openDebtor, setOpenDebtor] = useState<string | null>(null)
  const [openSettled, setOpenSettled] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const todayDate = useMemo(() => fromIsoDate(today), [today])
  const data = useMemo(
    () => computeFees(weeks, fees.value, payments.value, defaultFee.value.fee, range, todayDate),
    [weeks, fees.value, payments.value, defaultFee.value, range, todayDate],
  )
  const presets = useMemo(() => presetSummaries(weeks, todayDate), [weeks, todayDate])
  const shareText = useMemo(() => buildShareText(data, leagueName), [data, leagueName])

  // All time has no dates of its own; offer the oldest game in range up to today.
  const oldest = data.games[data.games.length - 1]
  const customFrom = data.range.from || (oldest ? isoDate(parseWeekDate(oldest.date)) : today)
  const customTo = data.range.to || today

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(id)
  }, [toast])

  // ── Saving ──────────────────────────────────────────────────────────────────

  const queue = useRef<Promise<void>>(Promise.resolve())
  const pending = useRef(0)
  const feeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const unsavedFee = useRef<number | null>(null)

  // Leaving the tab mid-debounce still saves the last default fee typed.
  useEffect(() => {
    return () => {
      clearTimeout(feeTimer.current)
      if (unsavedFee.current === null) return
      fetch(`/api/league/${leagueId}/fees`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultFee: unsavedFee.current }),
        keepalive: true,
      }).catch(() => {})
    }
  }, [leagueId])

  /** Queues a save. Saves run in order so two quick edits to one row land in order. */
  function save(path: string, method: string, body: unknown, revert: () => void) {
    pending.current++
    queue.current = queue.current.then(async () => {
      let ok = false
      try {
        const res = await fetch(`/api/league/${leagueId}${path}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        ok = res.ok
      } catch {
        ok = false
      }
      if (!ok) {
        revert()
        setToast(SAVE_FAILED)
      }
      pending.current--
      if (pending.current === 0) router.refresh()
    })
  }

  function toggleEntry(entry: FeeEntry) {
    const patch = { [entry.key]: !entry.paid }
    payments.set(patch)
    save(`/weeks/${entry.weekId}/payments`, 'PUT', { payer: entry.payer, paid: !entry.paid }, () =>
      payments.revert(patch),
    )
  }

  function settle(player: PlayerBalance) {
    const unpaid = player.entries.filter((e) => !e.paid)
    const patch = Object.fromEntries(unpaid.map((e) => [e.key, true]))
    payments.set(patch)
    setOpenDebtor(null)
    const weekIds = Array.from(new Set(unpaid.map((e) => e.weekId)))
    save('/payments/settle', 'POST', { player: player.name, weekIds }, () => payments.revert(patch))
  }

  function changeCost(weekId: string, fee: number | null) {
    const patch = { [weekId]: fee }
    fees.set(patch)
    if (fee === null) save(`/weeks/${weekId}/fee`, 'DELETE', undefined, () => fees.revert(patch))
    else save(`/weeks/${weekId}/fee`, 'PUT', { fee }, () => fees.revert(patch))
  }

  function changeDefaultFee(fee: number) {
    const patch = { fee }
    defaultFee.set(patch)
    unsavedFee.current = fee
    clearTimeout(feeTimer.current)
    feeTimer.current = setTimeout(() => {
      unsavedFee.current = null
      save('/fees', 'PATCH', { defaultFee: fee }, () => defaultFee.revert(patch))
    }, DEFAULT_FEE_DEBOUNCE_MS)
  }

  function changeRange(next: FeeRangeInput) {
    setRange(next)
    setOpenDebtor(null)
    setOpenSettled(null)
    // Keep the choice in the URL so a refresh or shared link keeps it. Next
    // syncs native history calls with its router, without a server round trip.
    const params = new URLSearchParams({ range: next.preset })
    if (next.preset === 'custom' && next.from && next.to) {
      params.set('from', next.from)
      params.set('to', next.to)
    }
    window.history.replaceState(null, '', `${pathname}?${params}`)
  }

  return (
    <>
      <RangeControl
        range={data.range}
        span={data.span}
        playedGames={data.totals.playedGames}
        presets={presets}
        customFrom={customFrom}
        customTo={customTo}
        onChange={changeRange}
      />
      <OutstandingCard data={data} onShare={() => setSheetOpen(true)} onDefaultFeeChange={changeDefaultFee} />
      <div className="mt-[26px] flex flex-col gap-[26px]">
        <WhoOwes
          players={data.debtors}
          totalOwed={data.totals.owed}
          openName={openDebtor}
          onOpenChange={setOpenDebtor}
          onToggleEntry={toggleEntry}
          onSettle={settle}
        />
        <Settled
          players={data.settled}
          openName={openSettled}
          onOpenChange={setOpenSettled}
          onToggleEntry={toggleEntry}
        />
        <div className="lg:hidden">
          <GamesColumn games={data.games} onCostChange={changeCost} />
        </div>
      </div>

      <SidebarPortal>
        <GamesWidget games={data.games} onCostChange={changeCost} />
        <SharePreview text={shareText} />
      </SidebarPortal>

      <ShareSheet open={sheetOpen} onOpenChange={setSheetOpen} text={shareText} />

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded border border-[#223a5c] bg-[#0c1728] px-4 py-2.5 font-plex text-[10px] font-bold uppercase tracking-[.14em] text-[#f4f9ff] shadow-[0_18px_44px_rgba(0,0,0,.42)]"
        >
          <span className="size-1.5 rounded-full bg-[#e2686f]" />
          {toast}
        </div>
      )}
    </>
  )
}
