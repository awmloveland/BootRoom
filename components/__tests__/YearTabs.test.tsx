/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react'
import { YearTabs, useResultsYear } from '@/components/YearTabs'
import type { Week } from '@/lib/types'

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

function makeWeek(season: string, week: number): Week {
  return { id: `${season}-${week}`, season, week, date: `01 Jan ${season}`, status: 'played', teamA: [], teamB: [], winner: null }
}

describe('YearTabs', () => {
  it('renders nothing for a single season', () => {
    const { container } = render(<YearTabs years={['2026']} selected="2026" onSelect={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for no seasons', () => {
    const { container } = render(<YearTabs years={[]} selected="2026" onSelect={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders one tab per season in the given order and marks the selected one', () => {
    render(<YearTabs years={['2026', '2025', '2024']} selected="2025" onSelect={() => {}} />)
    expect(screen.getByRole('tablist', { name: 'Season' })).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['2026', '2025', '2024'])
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
  })

  it('calls onSelect with the clicked year, but not for the selected one', () => {
    const onSelect = jest.fn()
    render(<YearTabs years={['2026', '2025']} selected="2026" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('tab', { name: '2026' }))
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: '2025' }))
    expect(onSelect).toHaveBeenCalledWith('2025')
  })
})

describe('useResultsYear', () => {
  beforeEach(() => window.history.replaceState(null, '', '/craft-football/results'))

  const weeks = [makeWeek('2026', 2), makeWeek('2025', 40)]

  it('starts on the year in the URL and reports whether it is the default', () => {
    window.history.replaceState(null, '', '/craft-football/results?year=2025')
    const { result } = renderHook(() => useResultsYear(weeks))
    expect(result.current.seasons).toEqual(['2026', '2025'])
    expect(result.current.year).toBe('2025')
    expect(result.current.isDefaultYear).toBe(false)
  })

  it('starts on the newest season with a bare URL', () => {
    const { result } = renderHook(() => useResultsYear(weeks))
    expect(result.current.year).toBe('2026')
    expect(result.current.isDefaultYear).toBe(true)
  })

  it('falls back to the newest season for a ?year= the league does not have', () => {
    window.history.replaceState(null, '', '/craft-football/results?year=1999')
    const { result } = renderHook(() => useResultsYear(weeks))
    expect(result.current.year).toBe('2026')
    expect(result.current.isDefaultYear).toBe(true)
  })

  it('restores the picked year from the URL when remounted after Back', () => {
    const first = renderHook(() => useResultsYear(weeks))
    act(() => first.result.current.selectYear('2025'))
    first.unmount()
    // Back restores the URL, then the page remounts from Next's cached payload.
    window.history.replaceState(null, '', '/craft-football/results?year=2025')
    const { result } = renderHook(() => useResultsYear(weeks))
    expect(result.current.year).toBe('2025')
  })

  it('selectYear switches year and writes the URL', () => {
    const { result } = renderHook(() => useResultsYear(weeks))
    act(() => result.current.selectYear('2025'))
    expect(result.current.year).toBe('2025')
    expect(window.location.search).toBe('?year=2025')
    act(() => result.current.selectYear('2026'))
    expect(result.current.year).toBe('2026')
    expect(result.current.isDefaultYear).toBe(true)
    expect(window.location.search).toBe('')
  })

  it('follows a new default season when the viewer is on the default year', () => {
    const { result, rerender } = renderHook(({ w }) => useResultsYear(w), { initialProps: { w: weeks } })
    rerender({ w: [{ ...makeWeek('2027', 1), status: 'scheduled' }, ...weeks] })
    expect(result.current.year).toBe('2027')
    expect(result.current.isDefaultYear).toBe(true)
  })

  it('stays on a picked past year when a new season appears', () => {
    window.history.replaceState(null, '', '/craft-football/results?year=2025')
    const { result, rerender } = renderHook(({ w }) => useResultsYear(w), { initialProps: { w: weeks } })
    rerender({ w: [makeWeek('2027', 1), ...weeks] })
    expect(result.current.year).toBe('2025')
  })
})
