/**
 * @jest-environment jsdom
 */
import { render } from '@testing-library/react'
import { Confetti } from '@/components/new-league/Confetti'
import { StepShell } from '@/components/new-league/StepShell'

function mockMotion(reduce: boolean) {
  window.matchMedia = jest.fn().mockReturnValue({ matches: reduce }) as unknown as typeof window.matchMedia
}

it('draws nothing when the user prefers reduced motion', () => {
  mockMotion(true)
  const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  render(<Confetti />)
  expect(getContext).not.toHaveBeenCalled()
  getContext.mockRestore()
})

it('starts drawing otherwise', () => {
  mockMotion(false)
  const ctx = { clearRect: jest.fn(), save: jest.fn(), restore: jest.fn(), translate: jest.fn(), rotate: jest.fn(), fillRect: jest.fn(), set globalAlpha(_: number) {}, set fillStyle(_: string) {} }
  const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
  const caf = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  const { unmount } = render(<Confetti />)
  expect(getContext).toHaveBeenCalledWith('2d')
  expect(raf).toHaveBeenCalled()
  unmount()
  expect(caf).toHaveBeenCalledWith(1)
  getContext.mockRestore()
  raf.mockRestore()
  caf.mockRestore()
})

describe('StepShell rise', () => {
  it('staggers the blocks only when asked', () => {
    const { container, rerender } = render(<StepShell title="t" sub="s">body</StepShell>)
    expect(container.querySelector('.motion-safe\\:animate-cf-rise')).toBeNull()
    rerender(<StepShell title="t" sub="s" rise>body</StepShell>)
    const risen = container.querySelectorAll('.motion-safe\\:animate-cf-rise')
    // No eyebrow or action here: logo, title, sub and body.
    expect(risen).toHaveLength(4)
    expect(risen[1].className).toContain('[--cf-rise-delay:.2s]')
  })
})
