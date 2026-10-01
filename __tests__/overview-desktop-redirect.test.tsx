/**
 * @jest-environment jsdom
 */
import { render, act } from '@testing-library/react'
import { OverviewDesktopRedirect } from '@/components/overview/OverviewDesktopRedirect'

const replace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}))

/** Installs a matchMedia stub and returns a function that flips it and fires `change`. */
function mockMatchMedia(initial: boolean) {
  const listeners = new Set<() => void>()
  const mq = {
    matches: initial,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }
  window.matchMedia = jest.fn().mockReturnValue(mq)
  return {
    set(matches: boolean) {
      mq.matches = matches
      listeners.forEach((fn) => fn())
    },
    listeners,
  }
}

beforeEach(() => replace.mockClear())

describe('OverviewDesktopRedirect', () => {
  it('sends a large screen to Results', () => {
    mockMatchMedia(true)
    render(<OverviewDesktopRedirect leagueSlug="the-boot-room" />)
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 1024px)')
    expect(replace).toHaveBeenCalledWith('/the-boot-room/results')
  })

  it('leaves a small screen alone', () => {
    mockMatchMedia(false)
    render(<OverviewDesktopRedirect leagueSlug="the-boot-room" />)
    expect(replace).not.toHaveBeenCalled()
  })

  it('redirects when the screen grows past the breakpoint, and stops listening on unmount', () => {
    const media = mockMatchMedia(false)
    const { unmount } = render(<OverviewDesktopRedirect leagueSlug="the-boot-room" />)
    act(() => media.set(true))
    expect(replace).toHaveBeenCalledWith('/the-boot-room/results')
    unmount()
    expect(media.listeners.size).toBe(0)
  })
})
