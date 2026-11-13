/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { ResultsStep } from '@/components/new-league/ResultsStep'
import { resultsKey } from '@/components/new-league/useSessionState'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))

const game = (teamA: string[]) => ({ id: 'd1', date: '05 Nov 2026', teamA, teamB: ['Will L'], winner: 'teamA', goalDifference: 1 })

function mount() {
  return render(<ResultsStep leagueId="g1" slug="hackney" roster={['Bobby', 'Will L']} imported={[]} latestMatchDay="12 Nov 2026" stepOffset={0} />)
}

beforeEach(() => sessionStorage.clear())

describe('ResultsStep', () => {
  it('restores unimported games after a refresh', async () => {
    sessionStorage.setItem(resultsKey('hackney'), JSON.stringify([game(['Bobby'])]))
    mount()
    expect(await screen.findByRole('button', { name: 'Import 1 game and finish' })).toBeEnabled()
  })

  it('holds back a stored game that names someone no longer on the roster', async () => {
    sessionStorage.setItem(resultsKey('hackney'), JSON.stringify([game(['Bob'])]))
    mount()
    expect(await screen.findByRole('button', { name: 'Import 1 game and finish' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Bob is no longer on the roster. Open the game on 5 Nov 2026 and fix the line-up.')
  })
})
