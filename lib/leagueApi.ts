// lib/leagueApi.ts
// Browser-side calls to the league write routes. Each throws an Error whose
// message is the route's `error` field, so callers can show it as before.
import type { CancelWeekInput, RecordResultInput, SaveLineupInput } from '@/lib/types'

async function send<T>(url: string, method: 'POST' | 'DELETE', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`)
  return data as T
}

export function saveLineup(leagueId: string, input: SaveLineupInput): Promise<{ weekId: string }> {
  return send(`/api/league/${leagueId}/lineup`, 'POST', input)
}

export function cancelLineup(leagueId: string, weekId: string): Promise<void> {
  return send(`/api/league/${leagueId}/lineup/${weekId}`, 'DELETE')
}

export function cancelWeek(leagueId: string, input: CancelWeekInput): Promise<{ weekId: string }> {
  return send(`/api/league/${leagueId}/weeks/cancel`, 'POST', input)
}

export function recordResult(leagueId: string, weekId: string, input: RecordResultInput): Promise<void> {
  return send(`/api/league/${leagueId}/weeks/${weekId}/result`, 'POST', input)
}
