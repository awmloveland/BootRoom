/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { ResultImage, resultHeadline } from '@/components/og/ResultShareImage'
import type { SharedResult } from '@/lib/types'

const RESULT: SharedResult = {
  leagueName: 'The Boot Room',
  slug: 'the-boot-room',
  week: 41,
  date: '06 Oct 2026',
  winner: 'teamA',
  goalDifference: 3,
  teamA: ['Marcus Reid', 'Rav Singh'],
  teamB: ['Callum Shaw', 'Sofia Marsh'],
  highlights: [
    { icon: 'flame', text: 'Marcus Reid · 4-game win streak' },
    { icon: 'zap', text: 'Upset · Team B stronger on paper' },
  ],
}

describe('ResultImage', () => {
  it('shows the headline, the winners and the highlights', () => {
    render(<ResultImage result={RESULT} />)
    expect(screen.getByText('The Boot Room · Week 41')).toBeInTheDocument()
    expect(screen.getByText('Tue 06 Oct')).toBeInTheDocument()
    expect(screen.getByText('Full time')).toBeInTheDocument()
    expect(screen.getByText('Team A')).toBeInTheDocument()
    expect(screen.getByText('win by 3')).toBeInTheDocument()
    expect(screen.getByText('Marcus Reid, Rav Singh')).toBeInTheDocument()
    expect(screen.getByText('Highlights')).toBeInTheDocument()
    expect(screen.getByText('Marcus Reid · 4-game win streak')).toBeInTheDocument()
    expect(screen.queryByText('Callum Shaw, Sofia Marsh')).not.toBeInTheDocument()
  })

  it('names the losing side when there are no highlights', () => {
    render(<ResultImage result={{ ...RESULT, highlights: [] }} />)
    expect(screen.getByText('Beat')).toBeInTheDocument()
    expect(screen.getByText('Callum Shaw, Sofia Marsh')).toBeInTheDocument()
  })

  it('treats a draw as honours even with both teams and no panel', () => {
    render(<ResultImage result={{ ...RESULT, winner: 'draw', goalDifference: 0, highlights: [] }} />)
    expect(screen.getByText('Honours')).toBeInTheDocument()
    expect(screen.getByText('even')).toBeInTheDocument()
    expect(screen.getByText('Team A · Marcus Reid, Rav Singh')).toBeInTheDocument()
    expect(screen.getByText('Team B · Callum Shaw, Sofia Marsh')).toBeInTheDocument()
    expect(screen.queryByText('Beat')).not.toBeInTheDocument()
  })
})

describe('resultHeadline', () => {
  it('names the winner and margin', () => {
    expect(resultHeadline({ winner: 'teamB', goalDifference: 1 })).toEqual(['Team B', 'win by 1'])
  })
})
