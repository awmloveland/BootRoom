import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { leagueLandingPath, VIEWPORT_COOKIE } from '@/lib/utils'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// Small screens land on Overview, large screens on Results. The server cannot
// see the viewport, so it reads the width the browser last reported in a
// cookie, falling back to the user agent on a first visit. /overview itself
// redirects large screens to Results on the client.
//
// The query string is kept so a shared lineup link (?lineup=) reaches the
// landing tab, whose metadata builds the link preview.
export default async function LeagueRootPage({ params, searchParams }: Props) {
  const { slug } = await params
  const userAgent = (await headers()).get('user-agent')
  const viewport = (await cookies()).get(VIEWPORT_COOKIE)?.value

  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') query.set(key, value)
  }
  const target = leagueLandingPath(slug, userAgent, viewport)
  const qs = query.toString()
  redirect(qs ? `${target}?${qs}` : target)
}
