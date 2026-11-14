// app/new/[[...step]]/page.tsx
import type { Metadata } from 'next'
import { NewLeagueWizard } from '@/components/new-league/NewLeagueWizard'
import { LiveScreen } from '@/components/new-league/LiveScreen'

interface Props {
  params: Promise<{ step?: string[] }>
}

const isLive = (step: string[]) => step.length === 2 && step[1] === 'live'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { step = [] } = await params
  return { title: isLive(step) ? 'League created' : 'Create a league' }
}

/**
 * Every /new URL. /new, /new/name, /new/where and /new/when render the wizard;
 * /new/[slug]/live renders the Live screen. One page because Next rejects
 * sibling dynamic segments with different names. The proxy has already
 * required a session and a profile.
 */
export default async function NewLeaguePage({ params }: Props) {
  const { step = [] } = await params
  if (isLive(step)) return <LiveScreen slug={step[0]} />
  return <NewLeagueWizard />
}
