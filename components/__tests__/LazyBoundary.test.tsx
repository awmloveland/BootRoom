/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { LazyBoundary } from '@/components/ui/LazyBoundary'

function Boom(): never {
  throw new Error('chunk failed')
}

describe('LazyBoundary', () => {
  it('renders children when nothing throws', () => {
    render(<LazyBoundary fallback={<p>fallback</p>}><p>content</p></LazyBoundary>)
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('renders the fallback when a child throws', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<LazyBoundary fallback={<p>fallback</p>}><Boom /></LazyBoundary>)
      expect(screen.getByText('fallback')).toBeInTheDocument()
    } finally {
      spy.mockRestore()
    }
  })
})
