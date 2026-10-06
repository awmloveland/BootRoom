// lib/feesServer.ts
// Server-only helpers for the Admin tab's pitch fees: the admin gate the fee
// API routes share, and the one place that reads fee rows from Supabase.
import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { DEFAULT_FEE_PER_PLAYER, feeEntryKey, type PaymentMap, type WeekFeeMap } from '@/lib/fees'

/** Largest value numeric(6,2) holds. */
export const MAX_FEE = 9999.99

/**
 * Resolves the caller and checks they admin this league via is_game_admin.
 * Returns the user, or the 401/403 response to send back.
 */
export async function requireLeagueAdmin(leagueId: string): Promise<{ user: User } | { response: NextResponse }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: isAdmin } = await supabase.rpc('is_game_admin', { p_game_id: leagueId })
  if (!isAdmin) return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user }
}

/** A fee from a request body: a finite, non-negative amount, rounded to pence. Null when invalid. */
export function parseFee(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > MAX_FEE) return null
  return Math.round(n * 100) / 100
}

/**
 * The league's default fee, week overrides and payments. Uses the service
 * client, so callers must have checked the viewer is an admin first.
 */
export async function getFeeRows(leagueId: string): Promise<{
  defaultFee: number
  fees: WeekFeeMap
  payments: PaymentMap
}> {
  const service = createServiceClient()
  const [game, fees, payments] = await Promise.all([
    service.from('games').select('fee_per_player').eq('id', leagueId).maybeSingle(),
    service.from('week_fees').select('week_id, fee_per_player').eq('game_id', leagueId),
    getAllPayments(leagueId),
  ])
  return {
    defaultFee: Number(game.data?.fee_per_player ?? DEFAULT_FEE_PER_PLAYER),
    fees: Object.fromEntries(
      ((fees.data ?? []) as { week_id: string; fee_per_player: number | string }[]).map((r) => [
        r.week_id,
        Number(r.fee_per_player),
      ]),
    ),
    payments: Object.fromEntries(payments.map((r) => [feeEntryKey(r.week_id, r.payer), r.paid])),
  }
}

const PAGE_SIZE = 1000

/**
 * Every payment row for the league. PostgREST caps a select at 1,000 rows and
 * a league gains one row per player per week, so read it a page at a time.
 */
async function getAllPayments(leagueId: string): Promise<{ week_id: string; payer: string; paid: boolean }[]> {
  const service = createServiceClient()
  const rows: { week_id: string; payer: string; paid: boolean }[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await service
      .from('week_payments')
      .select('week_id, payer, paid')
      .eq('game_id', leagueId)
      .order('week_id')
      .order('payer')
      .range(from, from + PAGE_SIZE - 1)
    rows.push(...((data ?? []) as typeof rows))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}
