// app/new/[[...step]]/page.tsx
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { NewLeagueWizard } from '@/components/new-league/NewLeagueWizard'
import { LiveScreen } from '@/components/new-league/LiveScreen'
import { RosterScreen } from '@/components/new-league/RosterScreen'
import { NEW_VISITOR_COOKIE } from '@/components/new-league/StepShell'
import { AccountStep } from '@/components/new-league/AccountStep'
import { getUser } from '@/lib/fetchers'

interface Props {
  params: Promise<{ step?: string[] }>
}

const ROSTER_STEPS = ['players', 'mentality', 'strength']
const isLive = (step: string[]) => step.length === 2 && step[1] === 'live'
const isRoster = (step: string[]) => step.length === 2 && ROSTER_STEPS.includes(step[1])

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { step = [] } = await params
  return { title: isLive(step) ? 'League created' : isRoster(step) ? 'Add your players' : 'Create a league' }
}

/**
 * Every /new URL. /new, /new/name, /new/where and /new/when render the wizard;
 * /new/[slug]/players, mentality and strength render the roster steps;
 * /new/[slug]/live renders the Live screen. One page because Next rejects
 * sibling dynamic segments with different names. The proxy requires a
 * session for the steps after creation; the pre-creation steps show the
 * Account step to a signed-out visitor.
 */
export default async function NewLeaguePage({ params }: Props) {
  const { step = [] } = await params
  if (isLive(step)) return <LiveScreen slug={step[0]} />
  if (isRoster(step)) return <RosterScreen slug={step[0]} />
  if (!(await getUser())) return <AccountStep />
  const stepOffset = (await cookies()).get(NEW_VISITOR_COOKIE) ? 1 : 0
  return <NewLeagueWizard stepOffset={stepOffset} />
}
