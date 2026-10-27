// app/new/[[...step]]/page.tsx
import type { Metadata } from 'next'
import { NewLeagueWizard } from '@/components/new-league/NewLeagueWizard'

export const metadata: Metadata = { title: 'Create a league' }

/** /new, /new/name, /new/where, /new/when. The proxy has already required a session and a profile. */
export default function NewLeaguePage() {
  return <NewLeagueWizard />
}
