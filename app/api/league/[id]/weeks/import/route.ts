import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin, rpcErrorResponse, rpcErrorStatus } from '@/lib/apiAuth'
import { revalidateLeague } from '@/lib/leagueCache'
import { getGame, getWeeks } from '@/lib/fetchers'
import { isSetupOver } from '@/lib/dates'
import { MAX_PLAYER_NAME } from '@/lib/playerUtils'
import type { Winner } from '@/lib/types'

const MAX_GAMES = 200
const MAX_SIDE = 30
const WEEK_DATE = /^\d{2} [A-Z][a-z]{2} \d{4}$/
const WINNERS: Exclude<Winner, null>[] = ['teamA', 'teamB', 'draw']

interface ImportGame {
  date: string
  teamA: string[]
  teamB: string[]
  winner: Exclude<Winner, null>
  goalDifference: number
}

/** One side's names, trimmed: 1 to 30 of them, none blank or over the roster's name limit. */
function parseSide(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_SIDE) return null
  const names = v.map((n) => (typeof n === 'string' ? n.trim() : ''))
  return names.every((n) => n !== '' && n.length <= MAX_PLAYER_NAME) ? names : null
}

function parseGame(v: unknown): ImportGame | null {
  const g = v as Record<string, unknown>
  if (!g || typeof g !== 'object') return null
  if (typeof g.date !== 'string' || !WEEK_DATE.test(g.date)) return null
  const teamA = parseSide(g.teamA)
  const teamB = parseSide(g.teamB)
  // Nobody plays twice in one game, on one side or both.
  if (!teamA || !teamB || new Set([...teamA, ...teamB]).size !== teamA.length + teamB.length) return null
  if (!WINNERS.includes(g.winner as Exclude<Winner, null>)) return null
  if (!Number.isInteger(g.goalDifference)) return null
  return { date: g.date, teamA, teamB, winner: g.winner as Exclude<Winner, null>, goalDifference: g.goalDifference as number }
}

/**
 * POST — admin only. Writes past results entered during league setup through
 * import_weeks, which validates dates, sides, winners and margins again,
 * renumbers the league's weeks and adds roster rows for new names. Refused
 * (409) once the league has played a game on or after its creation day.
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

  // The import renumbers every week of the league, so it is for setup only.
  const [league, weeks] = await Promise.all([getGame(id), getWeeks(id)])
  if (isSetupOver(weeks, league?.created_at)) {
    return NextResponse.json({ error: 'This league has already played a game. Record results from the Results tab.' }, { status: 409 })
  }

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
  if (error) {
    // The RPC raises terse codes; the two a careful admin can still hit get written for people.
    const text = error.message.includes('already_exists') ? 'You already have a game on one of those dates'
      : error.message.includes('invalid_date') ? 'One of the dates is in the future'
      : null
    if (text) return NextResponse.json({ error: text }, { status: rpcErrorStatus(error.message) })
    return rpcErrorResponse(error, 'Could not import the games. Try again.')
  }

  revalidateLeague(id)
  return NextResponse.json({ ok: true, count })
}
