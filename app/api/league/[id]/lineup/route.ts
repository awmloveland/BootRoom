import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/apiAuth'
import type { SaveLineupInput } from '@/lib/types'

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')
const numberOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function parseBody(body: unknown): SaveLineupInput | null {
  const b = body as Record<string, unknown>
  if (!b || typeof b !== 'object') return null
  if (typeof b.season !== 'string' || typeof b.week !== 'number' || typeof b.date !== 'string') return null
  if (!isStringArray(b.teamA) || !isStringArray(b.teamB)) return null
  return {
    season: b.season,
    week: b.week,
    date: b.date,
    format: typeof b.format === 'string' && b.format ? b.format : null,
    teamA: b.teamA,
    teamB: b.teamB,
    lineupMetadata: b.lineupMetadata && typeof b.lineupMetadata === 'object' ? (b.lineupMetadata as Record<string, unknown>) : null,
    teamARating: numberOrNull(b.teamARating),
    teamBRating: numberOrNull(b.teamBRating),
  }
}

/** POST — admin-only. Saves (or replaces) the scheduled line-up via save_lineup. Returns { weekId }. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireLeagueAdmin(id)
  if ('response' in gate) return gate.response

  const input = parseBody(await req.json().catch(() => null))
  if (!input) return NextResponse.json({ error: 'Invalid line-up' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('save_lineup', {
    p_game_id: id,
    p_season: input.season,
    p_week: input.week,
    p_date: input.date,
    p_format: input.format,
    p_team_a: input.teamA,
    p_team_b: input.teamB,
    p_lineup_metadata: input.lineupMetadata,
    p_team_a_rating: input.teamARating,
    p_team_b_rating: input.teamBRating,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ weekId: data as string })
}
