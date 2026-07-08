import { buildQuarterShareText } from '../utils'
import type { QuarterSummary, QuarterlyEntry } from '../sidebar-stats'

function entry(
  name: string, points: number, played: number, won: number, drew: number, lost: number
): QuarterlyEntry {
  return { name, played, won, drew, lost, points }
}

function makeQuarter(overrides: Partial<QuarterSummary> = {}): QuarterSummary {
  return {
    q: 2,
    year: 2026,
    quarterLabel: 'Q2 26',
    seasonName: 'Spring',
    status: 'completed',
    weekRange: { from: 14, to: 26 },
    dateRange: { from: '05 Apr 2026', to: '28 Jun 2026' },
    champion: 'Dave',
    entries: [
      entry('Dave', 32, 14, 10, 2, 2),
      entry('Ali', 29, 12, 9, 2, 1),
      entry('Steve', 24, 14, 7, 3, 4),
    ],
    awards: [
      { key: 'champion', nickname: 'Champion', icon: '🏅', player: 'Dave', stat: '32 pts' },
      { key: 'iron_man', nickname: 'Iron Man', icon: '⚽', player: 'Steve', stat: '14 games' },
      { key: 'sharp_shooter', nickname: 'Sharp Shooter', icon: '⚡', player: 'Ali', stat: '2.4 PPG' },
    ],
    gamesPlayed: 12,
    ...overrides,
  }
}

describe('buildQuarterShareText', () => {
  it('renders the full template', () => {
    const text = buildQuarterShareText({
      leagueName: 'The Boot Room',
      leagueSlug: 'the-boot-room',
      quarter: makeQuarter(),
    })

    expect(text).toBe([
      '🏁 That\'s a wrap on Q2 2026!',
      '⚽ The Boot Room — Spring quarter',
      '📅 05 Apr – 28 Jun · 12 games',
      '',
      '👑 Your Spring champion: Dave 🎉',
      '',
      '🎖️ Quarter honours',
      '⚽ Iron Man — Steve (14 games)',
      '⚡ Sharp Shooter — Ali (2.4 PPG)',
      '',
      '📊 Final standings',
      '1. Dave — 32pts (P14 W10 D2 L2)',
      '2. Ali — 29pts (P12 W9 D2 L1)',
      '3. Steve — 24pts (P14 W7 D3 L4)',
      '',
      '🔗 https://craft-football.com/the-boot-room/honours#q-2026-2',
    ].join('\n'))
  })

  it('excludes the champion award from the honours block', () => {
    const text = buildQuarterShareText({
      leagueName: 'The Boot Room',
      leagueSlug: 'the-boot-room',
      quarter: makeQuarter(),
    })
    expect(text).not.toContain('🏅 Champion')
    expect(text).toContain('👑 Your Spring champion: Dave 🎉')
  })

  it('omits the honours block entirely when only the champion award exists', () => {
    const text = buildQuarterShareText({
      leagueName: 'The Boot Room',
      leagueSlug: 'the-boot-room',
      quarter: makeQuarter({
        awards: [{ key: 'champion', nickname: 'Champion', icon: '🏅', player: 'Dave', stat: '32 pts' }],
      }),
    })
    expect(text).not.toContain('🎖️ Quarter honours')
  })

  it('caps the standings at 10 entries', () => {
    const entries = Array.from({ length: 12 }, (_, i) =>
      entry(`Player${i + 1}`, 30 - i, 10, 8, 0, 2)
    )
    const text = buildQuarterShareText({
      leagueName: 'The Boot Room',
      leagueSlug: 'the-boot-room',
      quarter: makeQuarter({ entries }),
    })
    expect(text).toContain('10. Player10')
    expect(text).not.toContain('11. Player11')
    expect(text).not.toContain('Player12')
  })

  it('uses singular "game" when only one game was played', () => {
    const text = buildQuarterShareText({
      leagueName: 'The Boot Room',
      leagueSlug: 'the-boot-room',
      quarter: makeQuarter({ gamesPlayed: 1 }),
    })
    expect(text).toContain('· 1 game\n')
    expect(text).not.toContain('1 games')
  })

  it('links to the honours tab and the shared quarter anchor', () => {
    const text = buildQuarterShareText({
      leagueName: 'Sunday League',
      leagueSlug: 'sunday-league',
      quarter: makeQuarter({ year: 2025, q: 3 }),
    })
    expect(text.endsWith('🔗 https://craft-football.com/sunday-league/honours#q-2025-3')).toBe(true)
  })
})
