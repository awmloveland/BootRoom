/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { PublicMatchList } from '@/components/PublicMatchList'
import type { QuarterSummary, ResultsCelebration } from '@/lib/sidebar-stats'
import type { Week } from '@/lib/types'

jest.mock('@/components/ResultModal', () => ({ ResultModal: () => null }))
jest.mock('@/components/EditWeekModal', () => ({ EditWeekModal: () => null }))

const writeText = jest.fn().mockResolvedValue(undefined)
beforeEach(() => {
  writeText.mockClear()
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true })
})

function quarter(q: number, champion: string, from: string, to: string): QuarterSummary {
  return {
    q, year: 2026, quarterLabel: `Q${q} 26`, seasonName: q === 1 ? 'Winter' : 'Spring', status: 'completed',
    weekRange: { from: 1, to: 2 }, dateRange: { from, to }, champion,
    entries: [{ name: champion, played: 6, won: 5, drew: 1, lost: 0, points: 16, goalDiff: 9 }],
    awards: [], gamesPlayed: 6,
  }
}

const Q1_URL = 'https://craft-football.com/test-fc/honours?quarter=tok1#q-2026-1'
const Q2_URL = 'https://craft-football.com/test-fc/honours?quarter=tok2#q-2026-2'

const CELEBRATION: ResultsCelebration = {
  quarters: [quarter(1, 'Marcus', '11 Mar 2026', '25 Mar 2026'), quarter(2, 'Priya', '08 Apr 2026', '22 Apr 2026')],
  leagueName: 'Test FC',
  leagueSlug: 'test-fc',
  shareUrls: { '2026-1': Q1_URL, '2026-2': Q2_URL },
}

function played(id: string, week: number, date: string): Week {
  return {
    id, season: '2026', week, date, status: 'played', format: '5-a-side',
    teamA: ['Jamie Ellis'], teamB: ['Jordan Taylor'], winner: 'teamA', goal_difference: 2,
  }
}

// Newest first, as the Results page lists them. The latest week is a DNF.
const WEEKS: Week[] = [
  { id: 'w4', season: '2026', week: 4, date: '22 Apr 2026', status: 'dnf', format: '5-a-side', teamA: ['Jamie Ellis'], teamB: ['Jordan Taylor'], winner: null },
  played('w3', 3, '08 Apr 2026'),
  played('w2', 2, '25 Mar 2026'),
  played('w1', 1, '11 Mar 2026'),
]

describe('PublicMatchList share links', () => {
  it('gives each quarter celebration card its own signed link', async () => {
    render(
      <PublicMatchList weeks={WEEKS} celebration={CELEBRATION} leagueName="Test FC" leagueSlug="test-fc"
        resultShareUrl="https://craft-football.com/test-fc?result=tok" />
    )
    const buttons = screen.getAllByRole('button', { name: 'Share the glory' })
    expect(buttons).toHaveLength(2)

    for (const button of buttons) {
      await act(async () => {
        fireEvent.click(button)
      })
    }

    const links = writeText.mock.calls.map((call) => (call[0] as string).split('\n').pop())
    // Cards render newest first: Q2 above Q1.
    expect(links).toEqual([`🔗 ${Q2_URL}`, `🔗 ${Q1_URL}`])
  })

  it('offers no result link when the latest week is a DNF', () => {
    render(
      <PublicMatchList weeks={WEEKS} leagueName="Test FC" leagueSlug="test-fc"
        resultShareUrl="https://craft-football.com/test-fc?result=tok" />
    )
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
    expect(writeText).not.toHaveBeenCalled()
  })
})
