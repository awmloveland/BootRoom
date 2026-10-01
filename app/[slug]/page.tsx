import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { leagueLandingPath } from '@/lib/utils'

interface Props {
  params: Promise<{ slug: string }>
}

// Small screens land on Overview, large screens on Results. The server cannot
// see the viewport, so it goes by user agent; /overview itself redirects large
// screens to Results on the client.
export default async function LeagueRootPage({ params }: Props) {
  const { slug } = await params
  const userAgent = (await headers()).get('user-agent')
  redirect(leagueLandingPath(slug, userAgent))
}
