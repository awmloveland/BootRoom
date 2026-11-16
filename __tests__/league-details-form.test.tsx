/**
 * @jest-environment jsdom
 */
import { render } from '@testing-library/react'
import { LeagueDetailsForm } from '@/components/LeagueDetailsForm'

jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }) }))

describe('LeagueDetailsForm', () => {
  // League setup lets a kick-off sit on any quarter hour; Settings must be able to show it.
  it('shows a quarter-past kick-off chosen during league setup', () => {
    const { container } = render(
      <LeagueDetailsForm
        leagueId="g1"
        leagueSlug="hackney-thursdays-k7x"
        initialDetails={{ location: 'Mabley Green', day: 'Thursday', kickoff_time: '20:15', bio: null }}
        playerCount={10}
        leagueName="Hackney Thursdays"
        onNameSaved={() => {}}
      />,
    )
    expect(container.querySelector<HTMLSelectElement>('select[name="kickoff-time"]')?.value).toBe('20:15')
  })
})
