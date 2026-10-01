import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { leagueLandingPath, VIEWPORT_COOKIE } from '@/lib/utils'

interface Props {
  params: Promise<{ slug: string }>
}

// Small screens land on Overview, large screens on Results. The server cannot
// see the viewport, so it reads the width the browser last reported in a
// cookie, falling back to the user agent on a first visit. /overview itself
// redirects large screens to Results on the client.
export default async function LeagueRootPage({ params }: Props) {
  const { slug } = await params
  const userAgent = (await headers()).get('user-agent')
  const viewport = (await cookies()).get(VIEWPORT_COOKIE)?.value
  redirect(leagueLandingPath(slug, userAgent, viewport))
}
