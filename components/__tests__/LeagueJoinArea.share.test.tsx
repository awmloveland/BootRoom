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
