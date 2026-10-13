/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { PendingRequestsBanner } from '@/components/PendingRequestsBanner'

it('shows who is waiting and links to the members settings', () => {
  render(
    <PendingRequestsBanner
      leagueSlug="test-fc"
      requests={{ joinNames: ['Callum Shaw', 'Priya Nair'], claimNames: ['Sofia Marsh'] }}
    />
  )
  expect(screen.getByText('2 people want to join')).toBeInTheDocument()
  expect(screen.getByText('Callum Shaw, Priya Nair · 1 player claim to review')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/test-fc/settings?tab=members')
})

it('renders nothing when nothing is waiting', () => {
  const { container } = render(
    <PendingRequestsBanner leagueSlug="test-fc" requests={{ joinNames: [], claimNames: [] }} />
  )
  expect(container).toBeEmptyDOMElement()
})
