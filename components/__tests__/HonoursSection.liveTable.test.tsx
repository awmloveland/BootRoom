/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { HonoursSection } from '@/components/HonoursSection'
import { computeAllQuarters, computeQuarterlyTable, getQuarterStanding } from '@/lib/sidebar-stats'
import type { Week } from '@/lib/types'

function played(week: number, date: string, teamA: string[], teamB: string[]): Week {
  return { id: `id-${week}`, season: date.slice(-4), week, date, status: 'played', teamA, teamB, winner: 'teamA' }
}

// 12 players: the six on Team A win, so Team B's six sit 7th to 12th alphabetically.
const TEAM_A = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']
const TEAM_B = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6']
const MID_Q2 = new Date(2026, 4, 15) // 15 May 2026, Thursdays

function renderHonours(weeks: Week[], now: Date, linkedName: string | null = null) {
  const liveTable = computeQuarterlyTable(weeks, now, 4)
  const standing = getQuarterStanding(liveTable.allEntries, linkedName)
  return render(
    <HonoursSection
      data={computeAllQuarters(weeks, now)}
      leagueName="Craft Football"
      leagueSlug="craft-football"
      liveTable={liveTable}
      standing={standing}
    />
  )
}

describe('HonoursSection in-progress quarter', () => {
  it('shows the live top 10 with games left, and no milestones', () => {
    renderHonours([played(18, '07 May 2026', TEAM_A, TEAM_B)], MID_Q2)
    expect(screen.getByText('A1')).toBeInTheDocument()
    expect(screen.getByText('B4')).toBeInTheDocument()
    expect(screen.queryByText('B5')).not.toBeInTheDocument()
    expect(screen.getByText(/1 of \d+ played/)).toBeInTheDocument()
    expect(screen.queryByText('Iron Man')).not.toBeInTheDocument()
    expect(screen.queryByText(/See All/)).not.toBeInTheDocument()
  })

  it('adds the linked player row with their true rank when outside the top 10', () => {
    renderHonours([played(18, '07 May 2026', TEAM_A, TEAM_B)], MID_Q2, 'B6')
    const row = screen.getByText('B6').parentElement!
    expect(row).toHaveTextContent('12')
    expect(row).toHaveTextContent('You')
    expect(screen.queryByText('B5')).not.toBeInTheDocument()
  })

  it('separates the out-of-top-10 row with a divider', () => {
    renderHonours([played(18, '07 May 2026', TEAM_A, TEAM_B)], MID_Q2, 'B6')
    const row = screen.getByText('B6').parentElement!
    expect(row.previousElementSibling).toHaveAttribute('aria-hidden')
  })

  it('adds no divider when the linked player is in the top 10', () => {
    renderHonours([played(18, '07 May 2026', TEAM_A, TEAM_B)], MID_Q2, 'B1')
    expect(screen.getByText('B1').parentElement!.previousElementSibling).not.toHaveAttribute('aria-hidden')
  })

  it('shows a message instead of a table before any game is played', () => {
    // Q3 has started with nothing played; the sidebar holds over Q2.
    renderHonours([played(18, '07 May 2026', TEAM_A, TEAM_B)], new Date(2026, 6, 2))
    expect(screen.getByText('The live table will appear here once the first game is played')).toBeInTheDocument()
  })

  it('keeps the full table and milestones for a completed quarter', () => {
    const weeks = [played(18, '07 May 2026', TEAM_A, TEAM_B)]
    renderHonours(weeks, new Date(2026, 6, 2))
    // Q2 is the completed card, open by default.
    expect(screen.getByText('Iron Man')).toBeInTheDocument()
    expect(screen.getByText(/See All \(12\)/)).toBeInTheDocument()
  })

  it('shows points per game on the live and completed tables', () => {
    const weeks = [
      played(14, '02 Apr 2026', TEAM_A, TEAM_B), // completed Q2 by July
      played(27, '02 Jul 2026', TEAM_A, TEAM_B), // live Q3
    ]
    renderHonours(weeks, new Date(2026, 6, 8))
    expect(screen.getAllByText('PPG')).toHaveLength(2)
    // Winners on 3.00 PPG, losers on 0.00, in both tables.
    expect(screen.getAllByText('3.00').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('0.00').length).toBeGreaterThanOrEqual(2)
  })
})
