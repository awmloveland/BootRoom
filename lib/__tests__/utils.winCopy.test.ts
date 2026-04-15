import { winCopy, buildShareText, buildResultShareText } from '../utils'
import type { Player, Week } from '../types'

describe('winCopy', () => {
  it('returns even copy when exactly 50/50', () => {
    const result = winCopy(0.5)
    expect(result.team).toBe('even')
    expect(result.text).toBe("Too close to call — this one could go either way")
  })

  it('returns even copy within 1pp of 50 (Team A side)', () => {
    const result = winCopy(0.51)
    expect(result.team).toBe('even')
  })

  it('returns even copy within 1pp of 50 (Team B side)', () => {
    const result = winCopy(0.49)
    expect(result.team).toBe('even')
  })

  it('returns slight edge copy for Team A at 53%', () => {
    const result = winCopy(0.53)
    expect(result.team).toBe('A')
    expect(result.text).toBe("Slight edge to Team A going into this one")
  })

  it('returns slight edge copy for Team B at 47%', () => {
    const result = winCopy(0.47)
    expect(result.team).toBe('B')
    expect(result.text).toBe("Slight edge to Team B going into this one")
  })

  it('returns stronger side copy at 58% Team A', () => {
    const result = winCopy(0.58)
    expect(result.team).toBe('A')
    expect(result.text).toBe("Team A look like the stronger side tonight")
  })

  it('returns favourites copy at 65% Team A', () => {
    const result = winCopy(0.65)
    expect(result.team).toBe('A')
    expect(result.text).toBe("Team A are favourites heading into this one")
  })

  it('returns heavy favourites copy at 75% Team B', () => {
    const result = winCopy(0.25)
    expect(result.team).toBe('B')
    expect(result.text).toBe("The odds heavily favour Team B tonight")
  })

  it('places 55% in the stronger-side bucket, not slight-edge', () => {
    const result = winCopy(0.55)
    expect(result.text).toBe("Team A look like the stronger side tonight")
  })

  it('places 62% in the favourites bucket, not stronger-side', () => {
    const result = winCopy(0.62)
    expect(result.text).toBe("Team A are favourites heading into this one")
  })
})

describe('buildShareText', () => {
  const base = {
    leagueName: 'The Boot Room',
    leagueId: 'abc123',
    week: 23,
    date: '10 Apr 2026',
    format: '6-a-side',
    teamA: ['Marcus', 'Jordan', 'Diego', 'Liam', 'Tom', 'Alex'],
    teamB: ['Sam', 'Kai', 'Jake', 'Rory', 'Ben', 'Chris'],
    teamARating: 72.4,
    teamBRating: 68.9,
  }

  it('includes the league name and week number', () => {
    const text = buildShareText(base)
    expect(text).toContain('The Boot Room')
    expect(text).toContain('Week 23')
  })

  it('includes the format and a short date with day name', () => {
    const text = buildShareText(base)
    // 10 Apr 2026 is a Friday
    expect(text).toContain('Fri 10 Apr')
    expect(text).toContain('6-a-side')
  })

  it('includes team A player names joined by comma', () => {
    const text = buildShareText(base)
    expect(text).toContain('Marcus, Jordan, Diego, Liam, Tom, Alex')
  })

  it('includes team B player names joined by comma', () => {
    const text = buildShareText(base)
    expect(text).toContain('Sam, Kai, Jake, Rory, Ben, Chris')
  })

  it('formats ratings to one decimal place', () => {
    const text = buildShareText(base)
    expect(text).toContain('72.4')
    expect(text).toContain('68.9')
  })

  it('includes a win prediction line', () => {
    const text = buildShareText(base)
    // 72.4 vs 68.9 — Team A should be favoured; the prediction must be on the 📊 line
    expect(text).toContain('📊 Team A')
  })

  it('includes the public league URL', () => {
    const text = buildShareText(base)
    expect(text).toContain('https://craft-football.com/abc123')
  })

  it('shows "Too close to call" copy for equal ratings', () => {
    const text = buildShareText({ ...base, teamARating: 70, teamBRating: 70 })
    expect(text).toContain('Too close to call')
  })
})

// ── helpers ──────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<Player> & { name: string }): Player {
  return {
    played: 10,
    won: 5,
    drew: 2,
    lost: 3,
    timesTeamA: 5,
    timesTeamB: 5,
    winRate: 0.5,
    qualified: true,
    points: 17,
    goalkeeper: false,
    mentality: 'balanced',
    rating: 2,
    recentForm: 'WDLWW',
    ...overrides,
  }
}

function makeWeek(overrides: Partial<Week> & { week: number; date: string }): Week {
  return {
    status: 'played',
    teamA: [],
    teamB: [],
    winner: 'teamA',
    goal_difference: 1,
    ...overrides,
  }
}

const BASE_PARAMS = {
  leagueName: 'The Boot Room',
  leagueId: 'abc123',
  week: 12,
  date: '10 Apr 2026',
  format: '6-a-side',
  teamA: ['Dave', 'Tom'],
  teamB: ['Jordan', 'Lee'],
  winner: 'teamA' as const,
  goalDifference: 2,
  teamARating: 4.1,
  teamBRating: 4.8,
  players: [
    makePlayer({ name: 'Dave', played: 10 }),
    makePlayer({ name: 'Tom', played: 10 }),
    makePlayer({ name: 'Jordan', played: 10 }),
    makePlayer({ name: 'Lee', played: 10 }),
  ],
  weeks: [
    makeWeek({ week: 12, date: '10 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA', goal_difference: 2 }),
  ],
}

describe('buildResultShareText', () => {
  // ── result headline ──

  it('includes winner headline for teamA win', () => {
    const { shareText } = buildResultShareText(BASE_PARAMS)
    expect(shareText).toContain('🏆 Team A win! (+2 goals)')
  })

  it('includes winner headline for teamB win', () => {
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, winner: 'teamB', teamARating: 4.8, teamBRating: 4.1 })
    expect(shareText).toContain('🏆 Team B win! (+2 goals)')
  })

  it('shows draw headline with no margin line', () => {
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, winner: 'draw', goalDifference: 0 })
    expect(shareText).toContain('🤝 Draw!')
    expect(shareText).not.toContain('goals)')
  })

  it('includes both team lineups', () => {
    const { shareText } = buildResultShareText(BASE_PARAMS)
    expect(shareText).toContain('Dave, Tom')
    expect(shareText).toContain('Jordan, Lee')
  })

  it('includes the public URL', () => {
    const { shareText } = buildResultShareText(BASE_PARAMS)
    expect(shareText).toContain('https://craft-football.com/abc123')
  })

  // ── upset flag ──

  it('emits upset line when lower-rated team wins', () => {
    // teamB (4.8) > teamA (4.1) but teamA won — upset
    const { shareText } = buildResultShareText(BASE_PARAMS)
    expect(shareText).toContain('😱 Upset!')
  })

  it('does not emit upset line when higher-rated team wins', () => {
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, teamARating: 4.8, teamBRating: 4.1 })
    expect(shareText).not.toContain('😱')
  })

  it('does not emit upset line when ratings are equal', () => {
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, teamARating: 4.0, teamBRating: 4.0 })
    expect(shareText).not.toContain('😱')
  })

  it('does not emit upset line on a draw', () => {
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, winner: 'draw', teamARating: 4.1, teamBRating: 4.8, goalDifference: 0 })
    expect(shareText).not.toContain('😱')
  })

  // ── win streak ──

  it('emits win streak line at exactly 3 games', () => {
    // Dave won last 2 games + wins tonight = streak of 3
    const weeks = [
      makeWeek({ week: 10, date: '27 Mar 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA' }),
      makeWeek({ week: 11, date: '03 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA' }),
      makeWeek({ week: 12, date: '10 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA', goal_difference: 2 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, weeks })
    expect(shareText).toContain('🔥 Dave on a 3-game winning streak')
  })

  it('does not emit win streak line at 2 games', () => {
    // Dave won last 1 game + wins tonight = streak of 2
    const weeks = [
      makeWeek({ week: 11, date: '03 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA' }),
      makeWeek({ week: 12, date: '10 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA', goal_difference: 2 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, weeks })
    expect(shareText).not.toContain('winning streak')
  })

  it('does not emit win streak for a draw', () => {
    const weeks = [
      makeWeek({ week: 10, date: '27 Mar 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA' }),
      makeWeek({ week: 11, date: '03 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA' }),
      makeWeek({ week: 12, date: '10 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'draw', goal_difference: 0 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, winner: 'draw', goalDifference: 0, weeks })
    expect(shareText).not.toContain('winning streak')
  })

  // ── unbeaten streak broken ──

  it('emits unbeaten streak broken at exactly 5 games', () => {
    // Jordan unbeaten for 5 then loses tonight (Jordan is on teamB, teamA wins)
    const weeks = [
      makeWeek({ week: 7,  date: '13 Mar 2026', teamA: ['Dave'], teamB: ['Jordan'], winner: 'teamB' }),
      makeWeek({ week: 8,  date: '20 Mar 2026', teamA: ['Jordan'], teamB: ['Dave'],  winner: 'teamA' }),
      makeWeek({ week: 9,  date: '27 Mar 2026', teamA: ['Jordan'], teamB: ['Dave'],  winner: 'draw' }),
      makeWeek({ week: 10, date: '03 Apr 2026', teamA: ['Jordan'], teamB: ['Dave'],  winner: 'teamA' }),
      makeWeek({ week: 11, date: '07 Apr 2026', teamA: ['Jordan'], teamB: ['Dave'],  winner: 'teamA' }),
      makeWeek({ week: 12, date: '10 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA', goal_difference: 2 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, weeks })
    expect(shareText).toContain("💔 Jordan")
    expect(shareText).toContain("5-game unbeaten run is over")
  })

  it('does not emit unbeaten streak broken at 4 games', () => {
    const weeks = [
      makeWeek({ week: 8,  date: '20 Mar 2026', teamA: ['Jordan'], teamB: ['Dave'],  winner: 'teamA' }),
      makeWeek({ week: 9,  date: '27 Mar 2026', teamA: ['Jordan'], teamB: ['Dave'],  winner: 'draw' }),
      makeWeek({ week: 10, date: '03 Apr 2026', teamA: ['Jordan'], teamB: ['Dave'],  winner: 'teamA' }),
      makeWeek({ week: 11, date: '07 Apr 2026', teamA: ['Jordan'], teamB: ['Dave'],  winner: 'teamA' }),
      makeWeek({ week: 12, date: '10 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA', goal_difference: 2 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, weeks })
    expect(shareText).not.toContain('unbeaten run is over')
  })

  // ── milestones ──

  it('emits milestone at exactly 10 games', () => {
    const players = [
      makePlayer({ name: 'Dave', played: 9 }),
      makePlayer({ name: 'Tom', played: 10 }),
      makePlayer({ name: 'Jordan', played: 10 }),
      makePlayer({ name: 'Lee', played: 10 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, players })
    expect(shareText).toContain('🎖️ Dave played their 10th game tonight')
  })

  it('does not emit milestone at 9 games', () => {
    const players = [
      makePlayer({ name: 'Dave', played: 8 }),
      makePlayer({ name: 'Tom', played: 10 }),
      makePlayer({ name: 'Jordan', played: 10 }),
      makePlayer({ name: 'Lee', played: 10 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, players })
    expect(shareText).not.toContain('🎖️ Dave')
  })

  it('emits milestone at 25 games', () => {
    const players = [
      makePlayer({ name: 'Dave', played: 24 }),
      makePlayer({ name: 'Tom', played: 10 }),
      makePlayer({ name: 'Jordan', played: 10 }),
      makePlayer({ name: 'Lee', played: 10 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, players })
    expect(shareText).toContain('🎖️ Dave played their 25th game tonight')
  })

  it('emits milestone at 50 games', () => {
    const players = [
      makePlayer({ name: 'Dave', played: 49 }),
      makePlayer({ name: 'Tom', played: 10 }),
      makePlayer({ name: 'Jordan', played: 10 }),
      makePlayer({ name: 'Lee', played: 10 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, players })
    expect(shareText).toContain('🎖️ Dave played their 50th game tonight')
  })

  it('does not emit milestone at 49 games', () => {
    const players = [
      makePlayer({ name: 'Dave', played: 48 }),
      makePlayer({ name: 'Tom', played: 10 }),
      makePlayer({ name: 'Jordan', played: 10 }),
      makePlayer({ name: 'Lee', played: 10 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, players })
    expect(shareText).not.toContain('🎖️ Dave')
  })

  it('emits milestone at 100 games', () => {
    const players = [
      makePlayer({ name: 'Dave', played: 99 }),
      makePlayer({ name: 'Tom', played: 10 }),
      makePlayer({ name: 'Jordan', played: 10 }),
      makePlayer({ name: 'Lee', played: 10 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, players })
    expect(shareText).toContain('🎖️ Dave played their 100th game tonight')
  })

  it('does not emit milestone at 51 games', () => {
    const players = [
      makePlayer({ name: 'Dave', played: 50 }),
      makePlayer({ name: 'Tom', played: 10 }),
      makePlayer({ name: 'Jordan', played: 10 }),
      makePlayer({ name: 'Lee', played: 10 }),
    ]
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, players })
    expect(shareText).not.toContain('🎖️ Dave')
  })

  // ── quarter table ──

  it('always includes Q standings with top 5', () => {
    const players = Array.from({ length: 6 }, (_, i) =>
      makePlayer({ name: `Player${i}`, played: 10, points: 20 - i })
    )
    const weeks = Array.from({ length: 6 }, (_, i) =>
      makeWeek({
        week: i + 1,
        date: '10 Apr 2026',
        teamA: ['Player0', 'Player1', 'Player2'],
        teamB: ['Player3', 'Player4', 'Player5'],
        winner: 'teamA',
      })
    )
    const { shareText } = buildResultShareText({ ...BASE_PARAMS, players, weeks })
    expect(shareText).toContain('📊')
    expect(shareText).toContain('standings')
  })

  // ── highlightsText ──

  it('returns non-empty highlightsText when highlights exist', () => {
    const weeks = [
      makeWeek({ week: 10, date: '27 Mar 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA' }),
      makeWeek({ week: 11, date: '03 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA' }),
      makeWeek({ week: 12, date: '10 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA', goal_difference: 2 }),
    ]
    const { highlightsText } = buildResultShareText({ ...BASE_PARAMS, weeks })
    expect(highlightsText.length).toBeGreaterThan(0)
    expect(highlightsText).toContain('🔥')
  })

  it('returns empty highlightsText when no highlights fired', () => {
    // No streaks, equal ratings (no upset), no milestones, single game
    const players = [
      makePlayer({ name: 'Dave', played: 10 }),
      makePlayer({ name: 'Tom', played: 10 }),
      makePlayer({ name: 'Jordan', played: 10 }),
      makePlayer({ name: 'Lee', played: 10 }),
    ]
    const weeks = [
      makeWeek({ week: 12, date: '10 Apr 2026', teamA: ['Dave', 'Tom'], teamB: ['Jordan', 'Lee'], winner: 'teamA', goal_difference: 1 }),
    ]
    const { highlightsText } = buildResultShareText({
      ...BASE_PARAMS,
      teamARating: 4.0,
      teamBRating: 4.0,
      players,
      weeks,
    })
    // Only the table and possibly in-form, but no 🔥 💔 😱 🎖️ lines
    expect(highlightsText).not.toContain('🔥')
    expect(highlightsText).not.toContain('💔')
    expect(highlightsText).not.toContain('😱')
    expect(highlightsText).not.toContain('🎖️')
  })
})
