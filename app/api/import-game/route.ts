import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function deriveSeason(weeks: { week: number; date: string; status: string }[]): string {
  const played = weeks.filter((w) => w.status === 'played')
  if (played.length === 0) return ''
  const sorted = [...played].sort((a, b) => a.week - b.week)
  const firstYear = sorted[0].date.split(' ')[2]
  const lastYear = sorted[sorted.length - 1].date.split(' ')[2]
  if (firstYear === lastYear) return firstYear
  return `${firstYear}–${lastYear.slice(-2)}`
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { name: string; data: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, data: jsonText } = body
  if (!name?.trim() || !jsonText) {
    return NextResponse.json({ error: 'Name and data required' }, { status: 400 })
  }

  let parsed: { league?: string; weeks?: unknown[]; config?: Record<string, unknown> }
  try {
    parsed = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText
  } catch {
    return NextResponse.json({ error: 'Invalid JSON data' }, { status: 400 })
  }

  const weeks = parsed.weeks ?? []
  if (!Array.isArray(weeks) || weeks.length === 0) {
    return NextResponse.json({ error: 'Weeks array required' }, { status: 400 })
  }

  const weeksTyped = weeks as { week: number; date: string; status: string }[]
  const season = deriveSeason(weeksTyped)
  const configValue = { league: parsed.league ?? name, ...(parsed.config ?? {}) }

  const { data: gameId, error: gameErr } = await supabase.rpc('create_game', {
    game_name: name.trim(),
  })
  if (gameErr) {
    return NextResponse.json({ error: gameErr.message }, { status: 500 })
  }

  const { error: configErr } = await supabase.from('config').insert({
    game_id: gameId,
    key: 'config',
    value: configValue,
  })
  if (configErr) {
    return NextResponse.json({ error: 'Config insert failed: ' + configErr.message }, { status: 500 })
  }

  const weeksToInsert = (weeks as Record<string, unknown>[]).map((w) => ({
    game_id: gameId,
    season,
    week: Number(w.week),
    date: String(w.date),
    status: String(w.status ?? 'played'),
    format: w.format ? String(w.format) : null,
    team_a: Array.isArray(w.teamA) ? w.teamA : (w.team_a as string[] ?? []),
    team_b: Array.isArray(w.teamB) ? w.teamB : (w.team_b as string[] ?? []),
    winner: w.winner ? String(w.winner) : null,
    notes: w.notes ? String(w.notes) : null,
  }))

  const { error: weeksErr } = await supabase.from('weeks').insert(weeksToInsert)
  if (weeksErr) {
    return NextResponse.json({ error: 'Weeks insert failed: ' + weeksErr.message }, { status: 500 })
  }

  return NextResponse.json({ gameId })
}
