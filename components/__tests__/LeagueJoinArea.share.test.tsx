/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { LeagueJoinArea } from '@/components/LeagueJoinArea'

jest.mock('next/navigation', () => ({
  usePathname: () => '/test-fc/results',
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
jest.mock('@/components/JoinRequestDialog', () => ({ JoinRequestDialog: () => null }))
jest.mock('@/components/AuthDialog', () => ({ AuthDialog: () => null }))

const writeText = jest.fn().mockResolvedValue(undefined)
beforeEach(() => {
  writeText.mockClear()
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true })
})

const PROPS = { leagueId: 'g', leagueSlug: 'test-fc', leagueName: 'Test FC', joinStatus: 'member' as const, isAdmin: false }

it('copies the page with the signed league token', () => {
  render(<LeagueJoinArea {...PROPS} shareToken="tok.sig" />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  expect(writeText).toHaveBeenCalledWith(leagueHref('tok.sig'))
})

it('copies the plain page without a token', () => {
  render(<LeagueJoinArea {...PROPS} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  expect(writeText).toHaveBeenCalledWith(window.location.href)
})

function leagueHref(token: string): string {
  const url = new URL(window.location.href)
  url.searchParams.set('league', token)
  return url.toString()
}

describe('admin settings link', () => {
  const ADMIN = { ...PROPS, isAdmin: true }

  it('links to the members settings with a count while requests are pending', () => {
    render(<LeagueJoinArea {...ADMIN} pendingRequestCount={2} />)
    const link = screen.getByRole('link', { name: 'League settings, 2 pending requests' })
    expect(link).toHaveAttribute('href', '/test-fc/settings?tab=members')
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('caps the count at 9+', () => {
    render(<LeagueJoinArea {...ADMIN} pendingRequestCount={12} />)
    expect(screen.getByRole('link', { name: 'League settings, 12 pending requests' })).toBeInTheDocument()
    expect(screen.getByText('9+')).toBeInTheDocument()
  })

  it('uses the singular for one request', () => {
    render(<LeagueJoinArea {...ADMIN} pendingRequestCount={1} />)
    expect(screen.getByRole('link', { name: 'League settings, 1 pending request' })).toBeInTheDocument()
  })

  it('links to plain settings with no badge when nothing is pending', () => {
    render(<LeagueJoinArea {...ADMIN} />)
    expect(screen.getByRole('link', { name: 'League settings' })).toHaveAttribute('href', '/test-fc/settings')
  })
})
