/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MatchCard } from '@/components/MatchCard'
import { QuarterCelebration } from '@/components/QuarterCelebration'
import type { QuarterSummary } from '@/lib/sidebar-stats'
import type { Week } from '@/lib/types'

jest.mock('@/components/ResultModal', () => ({ ResultModal: () => null }))
jest.mock('@/components/EditWeekModal', () => ({ EditWeekModal: () => null }))

const writeText = jest.fn().mockResolvedValue(undefined)
beforeEach(() => {
  writeText.mockClear()
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true })
})

const WEEK: Week = {
  id: 'w15', season: '2026', week: 15, date: '01 Apr 2026', status: 'played', format: '5-a-side',
  teamA: ['Jamie Ellis'], teamB: ['Jordan Taylor'], winner: 'teamA', goal_difference: 2,
}

const QUARTER: QuarterSummary = {
  q: 2, year: 2026, quarterLabel: 'Q2 26', seasonName: 'Spring', status: 'completed',
  weekRange: { from: 1, to: 2 }, dateRange: { from: '10 Apr 2026', to: '17 Apr 2026' }, champion: 'Marcus',
  entries: [{ name: 'Marcus', played: 6, won: 5, drew: 1, lost: 0, points: 16, goalDiff: 9 }], awards: [], gamesPlayed: 6,
}

async function clickAndRead(name: string): Promise<string> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
  return writeText.mock.calls[0][0] as string
}

describe('signed share links', () => {
  it('MatchCard shares the signed result link when it has one', async () => {
    render(
      <MatchCard week={WEEK} isOpen onToggle={() => {}} leagueName="Test FC" leagueSlug="test-fc"
        weeks={[WEEK]} isMostRecent shareUrl="https://craft-football.com/test-fc?result=tok" />
    )
    expect((await clickAndRead('Share')).split('\n').pop()).toBe('🔗 https://craft-football.com/test-fc?result=tok')
  })

  it('MatchCard falls back to the league link without one', async () => {
    render(<MatchCard week={WEEK} isOpen onToggle={() => {}} leagueName="Test FC" leagueSlug="test-fc" weeks={[WEEK]} isMostRecent />)
    expect((await clickAndRead('Share')).split('\n').pop()).toBe('🔗 https://craft-football.com/test-fc')
  })

  it('QuarterCelebration shares the signed quarter link when it has one', async () => {
    render(
      <QuarterCelebration quarter={QUARTER} leagueName="Test FC" leagueSlug="test-fc" variant="card"
        shareUrl="https://craft-football.com/test-fc/honours?quarter=tok#q-2026-2" />
    )
    expect((await clickAndRead('Share the glory')).split('\n').pop()).toBe(
      '🔗 https://craft-football.com/test-fc/honours?quarter=tok#q-2026-2'
    )
  })
})
