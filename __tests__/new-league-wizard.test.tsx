/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NewLeagueWizard } from '@/components/new-league/NewLeagueWizard'
import { DRAFT_KEY } from '@/components/new-league/useSessionState'

const push = jest.fn()
const replace = jest.fn()
let pathname = '/new/when'
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, refresh: jest.fn() }),
  usePathname: () => pathname,
}))

const DRAFT = { name: 'Hackney Thursdays', bio: '', location: 'Mabley Green', day: 'Thursday', time: '20:00', code: 'k7x' }
const CREATED = { ...DRAFT, created: { id: 'g1', slug: 'hackney-thursdays-k7x' } }
const fetchMock = jest.fn()

function respond(status: number, body: unknown = {}) {
  return Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) })
}

beforeEach(() => {
  jest.resetAllMocks()
  sessionStorage.clear()
  pathname = '/new/when'
  global.fetch = fetchMock as unknown as typeof fetch
})

describe('NewLeagueWizard', () => {
  it('stays on When after a refresh when the draft is stored', async () => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(DRAFT))
    render(<NewLeagueWizard stepOffset={0} />)
    expect(await screen.findByRole('heading', { name: 'When do you play?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create league' })).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('goes back to Name on a hard load of When with nothing stored', async () => {
    render(<NewLeagueWizard stepOffset={0} />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/new/name'))
  })

  it('creates the league, remembers it and moves to Who plays', async () => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(DRAFT))
    fetchMock.mockReturnValue(respond(200, { id: 'g1', slug: 'hackney-thursdays-k7x' }))
    render(<NewLeagueWizard stepOffset={0} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Create league' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/new/hackney-thursdays-k7x/players'))
    expect(fetchMock).toHaveBeenCalledWith('/api/games', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)!).created).toEqual({ id: 'g1', slug: 'hackney-thursdays-k7x' })
  })

  it('updates the existing league instead of creating a second one', async () => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(CREATED))
    fetchMock.mockReturnValue(respond(200, { ok: true, slug: 'hackney-thursdays-k7x' }))
    render(<NewLeagueWizard stepOffset={0} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/new/hackney-thursdays-k7x/players'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/league/g1/details')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ name: 'Hackney Thursdays', bio: '', location: 'Mabley Green', day: 'Thursday', kickoff_time: '20:00' })
  })

  it.each([403, 404])('forgets the league on a %i and creates a new one on the next press', async (status) => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(CREATED))
    fetchMock.mockReturnValueOnce(respond(status, { error: 'Nope' })).mockReturnValueOnce(respond(200, { id: 'g2', slug: 'hackney-thursdays-zzz' }))
    render(<NewLeagueWizard stepOffset={0} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    const create = await screen.findByRole('button', { name: 'Create league' })
    expect(push).not.toHaveBeenCalled()
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)!).created).toBeUndefined()
    fireEvent.click(create)
    await waitFor(() => expect(push).toHaveBeenCalledWith('/new/hackney-thursdays-zzz/players'))
    expect(fetchMock).toHaveBeenLastCalledWith('/api/games', expect.objectContaining({ method: 'POST' }))
  })

  it('keeps the bio open after a refresh on Name', async () => {
    pathname = '/new/name'
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...DRAFT, bio: 'Thursday nights' }))
    render(<NewLeagueWizard stepOffset={0} />)
    expect(await screen.findByDisplayValue('Thursday nights')).toBeInTheDocument()
  })

  it('shows the fixed address on Name once the league exists', async () => {
    pathname = '/new/name'
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...CREATED, name: 'Renamed League' }))
    render(<NewLeagueWizard stepOffset={0} />)
    expect(await screen.findByText('hackney-thursdays-k7x')).toBeInTheDocument()
  })
})
