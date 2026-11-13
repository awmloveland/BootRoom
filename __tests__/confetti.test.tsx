/**
 * @jest-environment jsdom
 */
import { render } from '@testing-library/react'
import { Confetti } from '@/components/new-league/Confetti'

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
  render(<Confetti />)
  expect(getContext).toHaveBeenCalledWith('2d')
  expect(raf).toHaveBeenCalled()
  getContext.mockRestore()
  raf.mockRestore()
})
