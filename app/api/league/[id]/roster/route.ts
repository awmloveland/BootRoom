import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin, rpcErrorStatus } from '@/lib/apiAuth'
import { revalidateLeague } from '@/lib/leagueCache'
import { strengthToRating } from '@/lib/strength'
import { parseAddPlayerBody, type AddPlayerInput } from '@/lib/playerUtils'

const MAX_PLAYERS = 60

/**
 * PUT — admin only. Writes the league setup roster in one promote_roster
 * call, which upserts by name (so the creator's existing row is updated).
 * Body: { players: [{ name, strength, mentality }] }, 1 to 60 entries.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireLeagueAdmin(id)
  if ('response' in gate) return gate.response

  const body = (await req.json().catch(() => null)) as { players?: unknown } | null
  const raw = Array.isArray(body?.players) ? body.players : null
  if (!raw || raw.length === 0 || raw.length > MAX_PLAYERS) {
    return NextResponse.json({ error: `Send between 1 and ${MAX_PLAYERS} players` }, { status: 400 })
  }
  const players: AddPlayerInput[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    const player = parseAddPlayerBody(entry)
    if (!player) return NextResponse.json({ error: 'Invalid player' }, { status: 400 })
    const key = player.name.toLowerCase()
    if (seen.has(key)) return NextResponse.json({ error: `${player.name} is listed twice` }, { status: 400 })
    seen.add(key)
    players.push(player)
  }

  // shortcut: no case-insensitive check against rows already in player_attributes, fine while
  // the setup wizard is the only caller and the league is new; add the ilike check from POST
  // /players if this is ever reused for an established roster
  const supabase = await createClient()
  const { error } = await supabase.rpc('promote_roster', {
    p_game_id: id,
    p_entries: players.map((p) => ({
      name: p.name,
      rating: strengthToRating(p.strength),
      mentality: p.mentality,
      goalkeeper: p.mentality === 'goalkeeper',
    })),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: rpcErrorStatus(error.message) })

  revalidateLeague(id)
  return NextResponse.json({ ok: true, count: players.length })
}
