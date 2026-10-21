import type { Metadata } from 'next'
import { leaguePageMetadata } from '@/lib/metadata'

interface Props {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

// The page does not export metadata of its own, so the tab title is set here.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return leaguePageMetadata((await params).slug, 'settings')
}

export default function LeagueSettingsLayout({ children }: Props) {
  return <>{children}</>
}
