/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { HonoursSection } from '@/components/HonoursSection'
import type { HonoursYear } from '@/lib/sidebar-stats'

const writeText = jest.fn().mockResolvedValue(undefined)
beforeEach(() => {
  writeText.mockClear()
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true })
})

const DATA: HonoursYear[] = [{
  year: 2026,
  completedCount: 1,
  quarters: [{
    q: 2, year: 2026, quarterLabel: 'Q2 26', seasonName: 'Spring', status: 'completed',
    weekRange: { from: 1, to: 6 }, dateRange: { from: '07 Apr 2026', to: '12 May 2026' }, champion: 'Marcus',
    entries: [{ name: 'Marcus', played: 6, won: 5, drew: 1, lost: 0, points: 16, goalDiff: 9 }],
    awards: [], gamesPlayed: 6,
  }],
}]

it('shares the signed quarter link from a completed quarter', async () => {
  render(
    <HonoursSection data={DATA} leagueName="Test FC" leagueSlug="test-fc"
      shareUrls={{ '2026-2': 'https://craft-football.com/test-fc/honours?quarter=tok#q-2026-2' }} />
  )
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Share the glory' }))
  })
  expect((writeText.mock.calls[0][0] as string).split('\n').pop()).toBe(
    '🔗 https://craft-football.com/test-fc/honours?quarter=tok#q-2026-2'
  )
})
