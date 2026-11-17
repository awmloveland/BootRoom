/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { LeagueRows } from '@/components/LeagueSwitcher'
import type { NavSession } from '@/lib/types'

const LEAGUES: NavSession['leagues'] = [
  { slug: 'thursday-fives', name: 'Thursday Night Fives', role: 'creator' },
  { slug: 'sunday-sevens', name: 'Sunday Sevens', role: 'member' },
]

it('links each league and marks the current one', () => {
  render(<LeagueRows leagues={LEAGUES} currentSlug="sunday-sevens" />)
  expect(screen.getByRole('link', { name: /Thursday Night Fives/ })).toHaveAttribute('href', '/thursday-fives')
  expect(screen.getByRole('link', { name: /Sunday Sevens/ })).toHaveAttribute('aria-current', 'true')
  expect(screen.getByRole('link', { name: /Thursday Night Fives/ })).not.toHaveAttribute('aria-current')
  // Only leagues the viewer runs carry the Admin tag.
  expect(screen.getAllByText('Admin')).toHaveLength(1)
})
