/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ResultsStep } from '@/components/new-league/ResultsStep'
import { resultsKey } from '@/components/new-league/useSessionState'

const push = jest.fn()
const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
const fetchMock = jest.fn()

const game = (teamA: string[]) => ({ id: 'd1', date: '05 Nov 2026', teamA, teamB: ['Will L'], winner: 'teamA', goalDifference: 1 })

function mount(imported: ReturnType<typeof game>[] = []) {
  return render(<ResultsStep leagueId="g1" slug="hackney" roster={['Bobby', 'Will L']} imported={imported as never} latestMatchDay="12 Nov 2026" stepOffset={0} />)
}

function respond(status: number, body: unknown = {}) {
  return Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) })
}

beforeEach(() => {
  jest.resetAllMocks()
  sessionStorage.clear()
  global.fetch = fetchMock as unknown as typeof fetch
})

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

  // An import whose reply was lost: the games landed, the stored drafts did not go.
  it('drops a stored game the league already holds', async () => {
    sessionStorage.setItem(resultsKey('hackney'), JSON.stringify([game(['Bobby'])]))
    mount([{ ...game(['Bobby']), id: 'w1' }])
    expect(await screen.findByRole('button', { name: 'Finish' })).toBeEnabled()
    expect(screen.getAllByText(/5 Nov 2026/)).toHaveLength(1)
  })

  it('re-reads the saved games when the import finds a date taken', async () => {
    sessionStorage.setItem(resultsKey('hackney'), JSON.stringify([game(['Bobby'])]))
    fetchMock.mockReturnValue(respond(409, { error: 'You already have a game on one of those dates' }))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Import 1 game and finish' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You already have a game on one of those dates')
    expect(refresh).toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('answers an unexpected failure in plain words', async () => {
    sessionStorage.setItem(resultsKey('hackney'), JSON.stringify([game(['Bobby'])]))
    fetchMock.mockReturnValue(respond(500, { error: 'deadlock detected' }))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Import 1 game and finish' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not import the games. Try again.'))
    expect(refresh).not.toHaveBeenCalled()
  })
})
