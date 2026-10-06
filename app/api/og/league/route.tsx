import { loadSharedLeague } from '@/lib/shareLinksServer'
import { shareImageResponse } from '@/lib/ogImage'
import { LeagueImage } from '@/components/og/LeagueShareImage'

export const runtime = 'nodejs'

// The token never changes but the next game moves weekly.
const LEAGUE_CACHE_CONTROL = 'public, max-age=300, s-maxage=900'

/** GET ?t=<token> — the link-preview image for a shared league link. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('t')
  return shareImageResponse(
    loadSharedLeague(token).then((league) => (league ? <LeagueImage league={league} /> : null)),
    LEAGUE_CACHE_CONTROL
  )
}
