import type { Metadata } from 'next'
import { leaguePageMetadata } from '@/lib/metadata'

interface Props {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

// The settings page is a client component, so its tab title is set here.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return leaguePageMetadata((await params).slug, 'settings')
}

export default function LeagueSettingsLayout({ children }: Props) {
  return <>{children}</>
}
