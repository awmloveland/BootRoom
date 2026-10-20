/**
 * The signed-in user's leagues, via the API route so the cookie session is
 * used. Only the league settings page calls this; PR 6 removes it.
 */
import type { Game } from '@/lib/types'

export async function fetchGames(): Promise<Game[]> {
  const res = await fetch('/api/games', { credentials: 'include' })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  return (data ?? []) as Game[]
}
