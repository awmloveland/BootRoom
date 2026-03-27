import { notFound } from 'next/navigation'
import { getGame, getAuthAndRole, getFeatures } from '@/lib/fetchers'

interface Props {
  children: React.ReactNode
  params: Promise<{ leagueId: string }>
}

export default async function LeagueLayout({ children, params }: Props) {
  const { leagueId } = await params
  // Pre-warm all shared fetchers in parallel. Pages call these same functions
  // and receive the cached results — no extra DB queries.
  const [game] = await Promise.all([
    getGame(leagueId),
    getAuthAndRole(leagueId),
    getFeatures(leagueId),
  ])
  if (!game) notFound()
  return <>{children}</>
}
