/**
 * @jest-environment jsdom
 */
import { render, act } from '@testing-library/react'
import { ViewportCookie } from '@/components/ViewportCookie'

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

beforeEach(() => {
  document.cookie = 'viewport=; path=/; max-age=0'
})

describe('ViewportCookie', () => {
  it('records a small screen as narrow', () => {
    mockMatchMedia(false)
    render(<ViewportCookie />)
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 1024px)')
    expect(document.cookie).toContain('viewport=narrow')
  })

  it('records a large screen as wide', () => {
    mockMatchMedia(true)
    render(<ViewportCookie />)
    expect(document.cookie).toContain('viewport=wide')
  })

  it('updates when the screen crosses the breakpoint, and stops listening on unmount', () => {
    const media = mockMatchMedia(true)
    const { unmount } = render(<ViewportCookie />)
    act(() => media.set(false))
    expect(document.cookie).toContain('viewport=narrow')
    unmount()
    expect(media.listeners.size).toBe(0)
  })
})
