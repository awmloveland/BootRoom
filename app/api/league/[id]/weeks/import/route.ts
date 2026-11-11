import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin, rpcErrorStatus } from '@/lib/apiAuth'
import { revalidateLeague } from '@/lib/leagueCache'
import type { Winner } from '@/lib/types'

const MAX_GAMES = 200
const WEEK_DATE = /^\d{2} [A-Z][a-z]{2} \d{4}$/
const WINNERS: Exclude<Winner, null>[] = ['teamA', 'teamB', 'draw']

interface ImportGame {
  date: string
  teamA: string[]
  teamB: string[]
  winner: Exclude<Winner, null>
  goalDifference: number
}

const isNames = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every((n) => typeof n === 'string' && n.trim() !== '') && new Set(v).size === v.length

function parseGame(v: unknown): ImportGame | null {
  const g = v as Record<string, unknown>
  if (!g || typeof g !== 'object') return null
  if (typeof g.date !== 'string' || !WEEK_DATE.test(g.date)) return null
  if (!isNames(g.teamA) || !isNames(g.teamB)) return null
  if (!WINNERS.includes(g.winner as Exclude<Winner, null>)) return null
  if (!Number.isInteger(g.goalDifference)) return null
  return { date: g.date, teamA: g.teamA, teamB: g.teamB, winner: g.winner as Exclude<Winner, null>, goalDifference: g.goalDifference as number }
}

/**
 * POST — admin only. Writes past results entered during league setup through
 * import_weeks, which validates dates, sides, winners and margins again,
 * renumbers the league's weeks and adds roster rows for new names.
 * Body: { games: [{ date: 'DD MMM YYYY', teamA, teamB, winner, goalDifference }] }.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireLeagueAdmin(id)
  if ('response' in gate) return gate.response

  const body = (await req.json().catch(() => null)) as { games?: unknown } | null
  const raw = Array.isArray(body?.games) ? body.games : null
  if (!raw || raw.length === 0 || raw.length > MAX_GAMES) {
    return NextResponse.json({ error: `Send between 1 and ${MAX_GAMES} games` }, { status: 400 })
  }
  const games = raw.map(parseGame)
  if (games.some((g) => g === null)) return NextResponse.json({ error: 'Invalid game' }, { status: 400 })

  const supabase = await createClient()
  const { data: count, error } = await supabase.rpc('import_weeks', {
    p_game_id: id,
    p_weeks: (games as ImportGame[]).map((g) => ({
      date: g.date,
      team_a: g.teamA,
      team_b: g.teamB,
      winner: g.winner,
      goal_difference: g.goalDifference,
    })),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: rpcErrorStatus(error.message) })

  revalidateLeague(id)
  return NextResponse.json({ ok: true, count })
}
