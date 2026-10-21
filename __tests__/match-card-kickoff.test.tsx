/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { MatchCard } from '@/components/MatchCard'
import type { Week } from '@/lib/types'

jest.mock('@/lib/leagueApi', () => ({
  saveLineup: jest.fn().mockResolvedValue({ weekId: 'w-new' }),
  cancelLineup: jest.fn().mockResolvedValue(undefined),
  cancelWeek: jest.fn().mockResolvedValue({ weekId: 'w-new' }),
  recordResult: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

const SCHEDULED: Week = {
  id: 'w16', season: '2026', week: 16, date: '09 Apr 2026', status: 'scheduled',
  teamA: ['Alice', 'Bob'], teamB: ['Charlie', 'Dave'], winner: null,
}

afterEach(() => { jest.useRealTimers() })

describe('MatchCard, scheduled week', () => {
  it('shows Awaiting Result from the league kick-off time', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 9, 18, 45))
    render(<MatchCard week={SCHEDULED} isOpen={false} onToggle={jest.fn()} kickoffTime="18:30" />)
    expect(screen.getByText('Awaiting Result')).toBeInTheDocument()
  })

  it('stays hidden before kick-off', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 9, 18, 15))
    const { container } = render(<MatchCard week={SCHEDULED} isOpen={false} onToggle={jest.fn()} kickoffTime="18:30" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('waits for 20:00 when the league has no kick-off time', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 9, 18, 45))
    const { container } = render(<MatchCard week={SCHEDULED} isOpen={false} onToggle={jest.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
