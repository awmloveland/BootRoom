/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { Hero } from '@/components/landing/Hero'

it('sends visitors to league creation, not a waitlist', () => {
  const { container } = render(<Hero />)
  expect(screen.getByRole('link', { name: 'Start your league' })).toHaveAttribute('href', '/new')
  expect(container.querySelector('a[href="#waitlist"]')).toBeNull()
})
