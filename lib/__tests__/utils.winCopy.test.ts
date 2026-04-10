import { winCopy, buildShareText } from '../utils'

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
