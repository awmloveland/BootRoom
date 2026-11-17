import { isSetupOver } from '@/lib/dates'
import type { Week } from '@/lib/types'

// Created on Monday 9 Nov 2026, in the evening.
const CREATED = '2026-11-09T19:30:00Z'
const week = (date: string, status: Week['status']): Week => ({ id: date, season: '2026', week: 1, date, status, teamA: ['A'], teamB: ['B'], winner: status === 'played' ? 'teamA' : null })

describe('isSetupOver', () => {
  it('is false for a league with no games', () => {
    expect(isSetupOver([], CREATED)).toBe(false)
  })
  it('is false when every played game is imported history', () => {
    expect(isSetupOver([week('05 Nov 2026', 'played'), week('29 Oct 2026', 'played')], CREATED)).toBe(false)
  })
  it('is false while later weeks are only scheduled, cancelled or unrecorded', () => {
    expect(isSetupOver([week('12 Nov 2026', 'scheduled'), week('19 Nov 2026', 'cancelled'), week('26 Nov 2026', 'unrecorded')], CREATED)).toBe(false)
  })
  it('is true once a game has been played on the day the league was created', () => {
    expect(isSetupOver([week('09 Nov 2026', 'played')], CREATED)).toBe(true)
  })
  it('is true once a game has been played after creation', () => {
    expect(isSetupOver([week('05 Nov 2026', 'played'), week('12 Nov 2026', 'played')], CREATED)).toBe(true)
  })
  it('treats a league with no creation date as established', () => {
    expect(isSetupOver([], null)).toBe(true)
  })
})
