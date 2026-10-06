// lib/fees.ts
// Pitch fees for the admin-only Admin tab: who owes what over a date range.
// Pure functions only, shared by the Admin page, its client view (which
// recomputes after every optimistic tick) and the fee API routes.
import { parseWeekDate } from '@/lib/utils'
import type {
  AdminMoneyData,
  FeeEntry,
  FeePreset,
  FeeRange,
  PlayerBalance,
  Week,
  WeekFeeRow,
} from '@/lib/types'

/** Week id → per-player fee override, from week_fees. */
export type WeekFeeMap = Record<string, number>
/** Entry key (`${weekId}|${payer}`) → paid, from week_payments. Absent = unpaid. */
export type PaymentMap = Record<string, boolean>

/** What the URL asks for. Custom dates are 'YYYY-MM-DD'. */
export interface FeeRangeInput {
  preset: FeePreset
  from?: string
  to?: string
}

export const DEFAULT_FEE_PRESET: FeePreset = '30'

/** The fixed presets, newest window first. `days` is how far back from today. */
export const FEE_PRESETS: { preset: Exclude<FeePreset, 'custom'>; label: string; days: number | null }[] = [
  { preset: '30', label: 'Last 30 days', days: 30 },
  { preset: '90', label: 'Last 3 months', days: 91 },
  { preset: '180', label: 'Last 6 months', days: 182 },
  { preset: 'all', label: 'All time', days: null },
]

export const CUSTOM_RANGE_LABEL = 'Custom range'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function feeEntryKey(weekId: string, payer: string): string {
  return `${weekId}|${payer}`
}

/** '£6' for whole pounds, '£6.50' otherwise. */
export function formatMoney(pounds: number): string {
  const pence = toPence(pounds)
  return pence % 100 === 0 ? `£${pence / 100}` : `£${(pence / 100).toFixed(2)}`
}

/** '01 Oct 2026' → '1 Oct'. */
export function shortWeekDate(date: string): string {
  const [d, m] = date.split(' ')
  return `${parseInt(d, 10)} ${m}`
}

/** '01 Oct 2026' → '1 Oct 2026'. */
export function longWeekDate(date: string): string {
  return `${shortWeekDate(date)} ${date.split(' ')[2]}`
}

function toPence(pounds: number): number {
  return Math.round(pounds * 100)
}

// ── Range ─────────────────────────────────────────────────────────────────────

/** Reads `?range=&from=&to=`. Anything unrecognised falls back to the last 30 days. */
export function parseFeeRange(params: { range?: string | null; from?: string | null; to?: string | null }): FeeRangeInput {
  const range = params.range ?? ''
  if (range === 'custom') {
    const input: FeeRangeInput = { preset: 'custom' }
    if (params.from && ISO_DATE.test(params.from)) input.from = params.from
    if (params.to && ISO_DATE.test(params.to)) input.to = params.to
    return input
  }
  const preset = FEE_PRESETS.find((p) => p.preset === range)
  return { preset: preset?.preset ?? DEFAULT_FEE_PRESET }
}

/** Local date → 'YYYY-MM-DD', the format the range URL and date inputs use. */
export function isoDate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

/** 'YYYY-MM-DD' → local midnight. */
export function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/**
 * Resolves a range to inclusive day bounds. Week dates have no time, so both
 * bounds are compared as local midnights. A custom range with a missing end
 * falls back to the last 30 days for that end; reversed dates are swapped.
 */
export function resolveFeeRange(input: FeeRangeInput, today: Date = new Date()): {
  range: FeeRange
  lo: Date | null
  hi: Date | null
} {
  const end = startOfDay(today)
  if (input.preset === 'custom') {
    let lo = input.from ? fromIsoDate(input.from) : addDays(end, -30)
    let hi = input.to ? fromIsoDate(input.to) : end
    if (lo > hi) [lo, hi] = [hi, lo]
    return { range: { preset: 'custom', from: isoDate(lo), to: isoDate(hi), label: CUSTOM_RANGE_LABEL }, lo, hi }
  }
  const preset = FEE_PRESETS.find((p) => p.preset === input.preset) ?? FEE_PRESETS[0]
  if (preset.days === null) {
    return { range: { preset: preset.preset, from: '', to: '', label: preset.label }, lo: null, hi: null }
  }
  const lo = addDays(end, -preset.days)
  return { range: { preset: preset.preset, from: isoDate(lo), to: isoDate(end), label: preset.label }, lo, hi: end }
}

/** Played and cancelled weeks inside the bounds, newest first. Only these carry fees. */
function weeksInRange(weeks: Week[], lo: Date | null, hi: Date | null): Week[] {
  return weeks
    .filter((w) => w.id && (w.status === 'played' || w.status === 'cancelled'))
    .map((w) => ({ w, t: parseWeekDate(w.date).getTime() }))
    .filter(({ t }) => (!lo || t >= lo.getTime()) && (!hi || t <= hi.getTime()))
    .sort((a, b) => b.t - a.t || b.w.week - a.w.week)
    .map(({ w }) => w)
}

/** '6 Sep – 1 Oct 2026' across newest-first weeks; the year repeats only when it changes. */
function spanOf(weeks: Week[]): string {
  if (weeks.length === 0) return 'No games'
  const newest = weeks[0].date
  const oldest = weeks[weeks.length - 1].date
  if (newest === oldest) return longWeekDate(newest)
  const sameYear = newest.split(' ')[2] === oldest.split(' ')[2]
  return `${sameYear ? shortWeekDate(oldest) : longWeekDate(oldest)} – ${longWeekDate(newest)}`
}

// ── Payers ────────────────────────────────────────────────────────────────────

export interface WeekPayer {
  payer: string     // the name the payment row is keyed by
  owedBy: string    // the player who pays it: themselves, or whoever brought the guest
  guest: boolean
}

const GUEST_SUFFIX = /\s\+\d+$/

/**
 * Everyone who owes a fee for a played week. Guests sit in the team arrays
 * under their guest name ('Alice +1'), so each name there is either a player
 * or a guest owed through `associatedPlayer`. Older weeks without line-up
 * metadata fall back to the name itself ('Alice +1' → 'Alice').
 */
export function weekPayers(week: Week): WeekPayer[] {
  if (week.status !== 'played') return []
  const guests = new Map((week.lineupMetadata?.guests ?? []).map((g) => [g.name, g.associatedPlayer]))
  const names = Array.from(new Set([...week.teamA, ...week.teamB]))
  return names.map((name) => {
    const via = guests.get(name)
    if (via) return { payer: name, owedBy: via, guest: true }
    if (GUEST_SUFFIX.test(name)) return { payer: name, owedBy: name.replace(GUEST_SUFFIX, ''), guest: true }
    return { payer: name, owedBy: name, guest: false }
  })
}

/** The payment rows "Mark all paid" writes: the player's own and guest entries in the given weeks. */
export function settlePayers(weeks: Week[], player: string, weekIds: string[]): { weekId: string; payer: string }[] {
  const ids = new Set(weekIds)
  return weeks
    .filter((w) => w.id && ids.has(w.id))
    .flatMap((w) =>
      weekPayers(w)
        .filter((p) => p.owedBy === player)
        .map((p) => ({ weekId: w.id!, payer: p.payer })),
    )
}

// ── Computation ───────────────────────────────────────────────────────────────

/**
 * One pass over the weeks in range. Only played weeks produce entries;
 * cancelled weeks still appear in `games` with no payers or cost.
 * Money is summed in pence so totals reconcile exactly.
 */
export function computeFees(
  weeks: Week[],
  fees: WeekFeeMap,
  payments: PaymentMap,
  defaultFee: number,
  rangeInput: FeeRangeInput,
  today: Date = new Date(),
): AdminMoneyData {
  const { range, lo, hi } = resolveFeeRange(rangeInput, today)
  const inRange = weeksInRange(weeks, lo, hi)

  const balances = new Map<string, { games: number; guests: number; entries: FeeEntry[] }>()
  const games: WeekFeeRow[] = []
  let expected = 0
  let collected = 0
  let playedGames = 0

  for (const w of inRange) {
    const weekId = w.id!
    const overridden = fees[weekId] !== undefined
    const cost = overridden ? fees[weekId] : defaultFee
    const payers = weekPayers(w)
    let paidCount = 0

    for (const { payer, owedBy, guest } of payers) {
      const key = feeEntryKey(weekId, payer)
      const paid = payments[key] === true
      if (paid) paidCount++
      expected += toPence(cost)
      if (paid) collected += toPence(cost)

      const balance = balances.get(owedBy) ?? { games: 0, guests: 0, entries: [] }
      if (guest) balance.guests++
      else balance.games++
      balance.entries.push({ key, weekId, payer, date: w.date, week: w.week, cost, paid, guest })
      balances.set(owedBy, balance)
    }

    if (w.status === 'played') playedGames++
    const guestCount = payers.filter((p) => p.guest).length
    games.push({
      weekId,
      date: w.date,
      week: w.week,
      status: w.status,
      players: payers.length - guestCount,
      guests: guestCount,
      paid: paidCount,
      payers: payers.length,
      cost: w.status === 'played' ? cost : 0,
      overridden: w.status === 'played' && overridden,
    })
  }

  const people: PlayerBalance[] = Array.from(balances, ([name, b]) => ({
    name,
    games: b.games,
    guests: b.guests,
    owed: b.entries.reduce((sum, e) => sum + (e.paid ? 0 : toPence(e.cost)), 0) / 100,
    // Entries arrive newest first; a stable sort keeps that within paid/unpaid.
    entries: [...b.entries].sort((a, b) => Number(a.paid) - Number(b.paid)),
  }))

  return {
    range,
    span: spanOf(inRange),
    defaultFee,
    games,
    debtors: people
      .filter((p) => p.owed > 0)
      .sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name)),
    settled: people
      .filter((p) => p.owed === 0 && p.entries.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name)),
    totals: {
      owed: (expected - collected) / 100,
      collected: collected / 100,
      expected: expected / 100,
      playedGames,
    },
  }
}

export interface PresetSummary {
  preset: Exclude<FeePreset, 'custom'>
  label: string
  span: string    // without the year, e.g. '6 Sep – 1 Oct'
  games: number   // played games
}

/** Each fixed preset's span and played-game count, for the range menu. */
export function presetSummaries(weeks: Week[], today: Date = new Date()): PresetSummary[] {
  return FEE_PRESETS.map(({ preset, label }) => {
    const { lo, hi } = resolveFeeRange({ preset }, today)
    const inRange = weeksInRange(weeks, lo, hi)
    return {
      preset,
      label,
      span: spanOf(inRange).replace(/ \d{4}$/, ''),
      games: inRange.filter((w) => w.status === 'played').length,
    }
  })
}

// ── Share text ────────────────────────────────────────────────────────────────

/**
 * Plain-text breakdown for the group chat: debtors only, biggest debt first,
 * each with their unpaid dates oldest first. No em dashes; `·` separates.
 */
export function buildShareText(data: AdminMoneyData, leagueName: string): string {
  const lines = [
    `${leagueName} · Money owed`,
    data.range.preset === 'custom' ? data.span : `${data.range.label} · ${data.span}`,
    '',
  ]

  if (data.debtors.length === 0) lines.push('All square, nobody owes anything.')
  for (const p of data.debtors) {
    const dates = p.entries
      .filter((e) => !e.paid)
      .sort((a, b) => parseWeekDate(a.date).getTime() - parseWeekDate(b.date).getTime() || a.week - b.week)
      .map((e) => shortWeekDate(e.date) + (e.guest ? ' (+1)' : ''))
    lines.push(`${p.name} · ${formatMoney(p.owed)}`, `  ${dates.join(', ')}`)
  }

  // Name the one cost when every game shares it; otherwise lead with the default.
  const costs = new Set(data.games.filter((g) => g.status === 'played').map((g) => toPence(g.cost)))
  const perGame =
    costs.size === 1
      ? `${formatMoney([...costs][0] / 100)} per player per game`
      : costs.size === 0
        ? `${formatMoney(data.defaultFee)} per player per game`
        : `${formatMoney(data.defaultFee)} per player per game, some games differ`

  lines.push('', `Total outstanding · ${formatMoney(data.totals.owed)}`, perGame)
  return lines.join('\n')
}
