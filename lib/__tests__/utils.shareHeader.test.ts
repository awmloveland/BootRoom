import { buildResultHeadline } from '../utils'

describe('buildResultHeadline', () => {
  it('formats a Team A win with plural goals', () => {
    expect(buildResultHeadline('teamA', 2, false)).toBe('Team A Wins! (+2 goals)')
  })

  it('formats a Team A win with singular goal', () => {
    expect(buildResultHeadline('teamA', 1, false)).toBe('Team A Wins! (+1 goal)')
  })

  it('formats a Team B win with plural goals', () => {
    expect(buildResultHeadline('teamB', 3, false)).toBe('Team B Wins! (+3 goals)')
  })

  it('formats a Team B win with singular goal', () => {
    expect(buildResultHeadline('teamB', 1, false)).toBe('Team B Wins! (+1 goal)')
  })

  it('formats a draw without margin', () => {
    expect(buildResultHeadline('draw', 0, false)).toBe('Draw')
  })

  it('formats DNF regardless of winner / margin inputs', () => {
    expect(buildResultHeadline(null, 0, true)).toBe('Did Not Finish')
    expect(buildResultHeadline('teamA', 5, true)).toBe('Did Not Finish')
  })
})
