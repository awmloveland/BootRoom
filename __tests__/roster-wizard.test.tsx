/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RosterWizard, type RosterPlayer } from '@/components/new-league/RosterWizard'
import { rosterKey } from '@/components/new-league/useSessionState'

const push = jest.fn()
const replace = jest.fn()
const refresh = jest.fn()
let pathname = '/new/hackney/strength'
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, refresh }),
  usePathname: () => pathname,
}))

const player = (name: string, extra: Partial<RosterPlayer> = {}): RosterPlayer => ({ id: name, name, mentality: 'balanced', strength: 'average', ...extra })
const INITIAL = [player('Will L', { you: true }), player('Bob'), player('Carl')]
const fetchMock = jest.fn()

function respond(status: number, body: unknown = {}) {
  return Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) })
}

function mount() {
  return render(<RosterWizard leagueId="g1" slug="hackney" initial={INITIAL} stepOffset={0} />)
}

beforeEach(() => {
  jest.resetAllMocks()
  sessionStorage.clear()
  pathname = '/new/hackney/strength'
  global.fetch = fetchMock as unknown as typeof fetch
  fetchMock.mockImplementation(() => respond(200, { ok: true }))
})

describe('RosterWizard', () => {
  it('restores a stored list after a refresh on Strength', async () => {
    sessionStorage.setItem(rosterKey('hackney'), JSON.stringify({ players: [...INITIAL, player('Dan', { id: 'new-1' })], removed: [] }))
    mount()
    expect(await screen.findByText('Dan')).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('deletes removed players, then renames, then upserts the list', async () => {
    sessionStorage.setItem(
      rosterKey('hackney'),
      JSON.stringify({ players: [INITIAL[0], { ...INITIAL[1], name: 'Bobby' }, player('Dan', { id: 'new-1' })], removed: ['Carl'] }),
    )
    mount()
    await screen.findByText('Bobby')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/new/hackney/results'))

    expect(fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      'DELETE /api/league/g1/players/Carl',
      'PATCH /api/league/g1/players/Bob/rename',
      'PUT /api/league/g1/roster',
    ])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ new_name: 'Bobby' })
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).players.map((p: { name: string }) => p.name)).toEqual(['Will L', 'Bobby', 'Dan'])
    expect(sessionStorage.getItem(rosterKey('hackney'))).toBeNull()
  })

  it('deletes a removed player whose name a rename takes, and keeps one typed back in', async () => {
    sessionStorage.setItem(
      rosterKey('hackney'),
      JSON.stringify({ players: [INITIAL[0], { ...INITIAL[1], name: 'Carl' }, player('Dan', { id: 'new-1' })], removed: ['Carl', 'Dan'] }),
    )
    render(<RosterWizard leagueId="g1" slug="hackney" initial={[...INITIAL, player('Dan')]} stepOffset={0} />)
    await screen.findByText('Dan')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/new/hackney/results'))
    expect(fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      'DELETE /api/league/g1/players/Carl',
      'PATCH /api/league/g1/players/Bob/rename',
      'PUT /api/league/g1/roster',
    ])
  })

  it('treats a delete that finds nobody as done', async () => {
    sessionStorage.setItem(rosterKey('hackney'), JSON.stringify({ players: [INITIAL[0], INITIAL[1]], removed: ['Carl'] }))
    fetchMock.mockImplementation((_url: string, init: { method: string }) => respond(init.method === 'DELETE' ? 404 : 200))
    mount()
    await screen.findByText('Bob')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/new/hackney/results'))
  })

  it('keeps the stored list and reloads the saved one when a call fails', async () => {
    const stored = JSON.stringify({ players: [INITIAL[0], { ...INITIAL[1], name: 'Bobby' }], removed: [] })
    sessionStorage.setItem(rosterKey('hackney'), stored)
    fetchMock.mockImplementation((_url: string, init: { method: string }) => respond(init.method === 'PATCH' ? 409 : 200))
    mount()
    await screen.findByText('Bobby')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Bobby is already on the list')
    expect(push).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
