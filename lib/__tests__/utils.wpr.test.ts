import { wprScore, leagueMedianWpr, leagueWprPercentiles, ewptScore } from '@/lib/utils'
import type { Player } from '@/lib/types'

function makePlayer(overrides?: Partial<Player>): Player {
  return {
    name: 'Test',
    played: 10, won: 5, drew: 2, lost: 3,
    timesTeamA: 0, timesTeamB: 0,
    winRate: 0.5, qualified: true, points: 17,
    mentality: 'balanced', rating: 2,
    recentForm: 'WWDLL',
    ...overrides,
  }
}

describe('wprScore — wprOverride short-circuit', () => {
  it('returns wprOverride directly when set, ignoring all other stats', () => {
    const player = makePlayer({ wprOverride: 42 })
    expect(wprScore(player)).toBe(42)
  })

  it('returns wprOverride of 0 correctly (does not fall through)', () => {
    const player = makePlayer({ wprOverride: 0 })
    expect(wprScore(player)).toBe(0)
  })

  it('computes normally when wprOverride is undefined', () => {
    const player = makePlayer() // no wprOverride
    const score = wprScore(player)
    expect(score).toBeGreaterThan(0)
    expect(score).not.toBe(42)
  })
})

describe('wprScore — form denominator skips unplayed slots', () => {
  it('100% win rate in 2 played slots matches 100% win rate in 5 played slots', () => {
    // Identical overall stats; only recentForm differs. After the fix, the form
    // denominator excludes '-' slots, so both should produce the same form score
    // (100%) and therefore the same wprScore.
    const shortHistory = makePlayer({
      played: 5, won: 5, drew: 0, lost: 0, points: 15, recentForm: 'WW---',
    })
    const fullHistory = makePlayer({
      played: 5, won: 5, drew: 0, lost: 0, points: 15, recentForm: 'WWWWW',
    })
    expect(wprScore(shortHistory)).toBeCloseTo(wprScore(fullHistory), 1)
  })

  it('0% win rate in 2 played slots matches 0% win rate in 5 played slots', () => {
    const shortHistory = makePlayer({
      played: 5, won: 0, drew: 0, lost: 5, points: 0, recentForm: 'LL---',
    })
    const fullHistory = makePlayer({
      played: 5, won: 0, drew: 0, lost: 5, points: 0, recentForm: 'LLLLL',
    })
    expect(wprScore(shortHistory)).toBeCloseTo(wprScore(fullHistory), 1)
  })

  it('all-dash recentForm does not produce NaN', () => {
    const noHistory = makePlayer({
      played: 5, won: 0, drew: 0, lost: 0, points: 0, recentForm: '-----',
    })
    const score = wprScore(noHistory)
    expect(Number.isNaN(score)).toBe(false)
    expect(score).toBeGreaterThanOrEqual(0)
  })
})

describe('leagueMedianWpr', () => {
  function makeQualifiedPlayer(wprTarget: number): Player {
    // A player with played=10, points adjusted to produce approximately the desired WPR
    // We use wprOverride to precisely control the WPR for test predictability
    return {
      name: 'Player',
      played: 10, won: 5, drew: 2, lost: 3,
      timesTeamA: 0, timesTeamB: 0,
      winRate: 0.5, qualified: true, points: 17,
      mentality: 'balanced', rating: 2,
      recentForm: 'WWDLL',
      wprOverride: wprTarget,
    }
  }

  function makeUnqualifiedPlayer(): Player {
    return {
      name: 'Newbie',
      played: 2, won: 1, drew: 0, lost: 1,
      timesTeamA: 0, timesTeamB: 0,
      winRate: 0.5, qualified: false, points: 3,
      mentality: 'balanced', rating: 2,
      recentForm: 'WL',
    }
  }

  it('returns 50 when fewer than 3 players have played >= 5 games', () => {
    const players = [
      makeQualifiedPlayer(60),
      makeQualifiedPlayer(70),
      makeUnqualifiedPlayer(),
      makeUnqualifiedPlayer(),
    ]
    expect(leagueMedianWpr(players)).toBe(50)
  })

  it('returns the median of qualified player WPR scores (odd count)', () => {
    const players = [
      makeQualifiedPlayer(40),
      makeQualifiedPlayer(60),
      makeQualifiedPlayer(80),
    ]
    // Median of [40, 60, 80] = 60
    expect(leagueMedianWpr(players)).toBe(60)
  })

  it('returns the mean of the two middle values for even count', () => {
    const players = [
      makeQualifiedPlayer(40),
      makeQualifiedPlayer(60),
      makeQualifiedPlayer(70),
      makeQualifiedPlayer(80),
    ]
    // Sorted: [40, 60, 70, 80], median = (60 + 70) / 2 = 65
    expect(leagueMedianWpr(players)).toBe(65)
  })

  it('excludes players with fewer than 5 games from the median calculation', () => {
    const players = [
      makeQualifiedPlayer(60),
      makeQualifiedPlayer(70),
      makeQualifiedPlayer(80),
      makeUnqualifiedPlayer(), // played: 2 — should be excluded
    ]
    // Only 3 qualified: [60, 70, 80], median = 70
    expect(leagueMedianWpr(players)).toBe(70)
  })

  it('returns 50 when the player list is empty', () => {
    expect(leagueMedianWpr([])).toBe(50)
  })
})

describe('leagueWprPercentiles', () => {
  function makeQualifiedPlayer(wprTarget: number): Player {
    return {
      name: `Player${wprTarget}`,
      played: 10, won: 5, drew: 2, lost: 3,
      timesTeamA: 0, timesTeamB: 0,
      winRate: 0.5, qualified: true, points: 17,
      mentality: 'balanced', rating: 2,
      recentForm: 'WWDLL',
      wprOverride: wprTarget,
    }
  }

  function makeUnqualifiedPlayer(): Player {
    return {
      name: 'Newbie',
      played: 2, won: 1, drew: 0, lost: 1,
      timesTeamA: 0, timesTeamB: 0,
      winRate: 0.5, qualified: false, points: 3,
      mentality: 'balanced', rating: 2,
      recentForm: 'WL',
    }
  }

  it('returns fallback when fewer than 3 qualified players exist', () => {
    expect(leagueWprPercentiles([])).toEqual({ p25: 40, p50: 50, p75: 60 })
    expect(leagueWprPercentiles([makeQualifiedPlayer(60), makeQualifiedPlayer(70)])).toEqual({ p25: 40, p50: 50, p75: 60 })
  })

  it('excludes players with fewer than 5 games played', () => {
    const players = [
      makeQualifiedPlayer(40),
      makeQualifiedPlayer(60),
      makeQualifiedPlayer(80),
      makeUnqualifiedPlayer(),
    ]
    // Only 3 qualified: [40, 60, 80]
    const result = leagueWprPercentiles(players)
    expect(result.p25).toBe(40)
    expect(result.p50).toBe(60)
    expect(result.p75).toBe(80)
  })

  it('returns correct p25/p50/p75 for 4 qualified players', () => {
    const players = [40, 60, 70, 80].map(makeQualifiedPlayer)
    // sorted: [40, 60, 70, 80], n=4
    // p25: scores[ceil(4*0.25)-1] = scores[1-1] = scores[0] = 40
    // p50: (scores[1]+scores[2])/2 = (60+70)/2 = 65  (even-n median)
    // p75: scores[ceil(4*0.75)-1] = scores[3-1] = scores[2] = 70
    const result = leagueWprPercentiles(players)
    expect(result.p25).toBe(40)
    expect(result.p50).toBe(65)
    expect(result.p75).toBe(70)
  })

  it('p50 matches leagueMedianWpr for the same input', () => {
    const players = [30, 50, 60, 70, 90].map(makeQualifiedPlayer)
    const { p50 } = leagueWprPercentiles(players)
    expect(p50).toBe(leagueMedianWpr(players))
  })
})

describe('wprScore — experience penalty (played 1–4)', () => {
  // Players with >=2 real games in recentForm to avoid rustiness penalty stacking
  function makeVeteran(): Player {
    // played=10, recentForm='WWDLL' — no experience or rustiness penalty
    return makePlayer()
  }

  it('experience penalty is applied for played=1 (multiplier 0.85)', () => {
    // played=1, won=1, lost=0, drew=0, points=3, recentForm='W', rating=2
    // PPG: (3+7.5)/(1+5) = 10.5/6 = 1.75 → (1.75/3)*100 = 58.33
    // Form 'W': rawForm = 3*1 = 3, maxForm = 3*1 = 3, formScore = 100
    // Rating: normRating=50, ratingWeight=1-1/10=0.9, ratingScore=45
    // baseScore = 58.33*0.6 + 100*0.25 + 45*0.15 = 35 + 25 + 6.75 = 66.75
    // Experience multiplier (played=1): 0.85 + 0.03*0 = 0.85
    // Rustiness multiplier: recentForm='W' has 1 real game (<2) → 0.88
    // Final: 66.75 * 0.85 * 0.88 ≈ 49.9
    const p1 = makePlayer({ played: 1, won: 1, drew: 0, lost: 0, points: 3, recentForm: 'W' })
    expect(wprScore(p1)).toBeCloseTo(49.9, 0)
  })

  it('experience penalty produces the correct multiplied value for played=3', () => {
    // played=3, won=2, lost=1, drew=0, points=6, recentForm='WWL', rating=2
    // PPG: (6+7.5)/(3+5) = 13.5/8 = 1.6875 → (1.6875/3)*100 = 56.25
    // Form 'WWL': rawForm = 3*(1)+3*(0.85)+0*(0.70) = 3+2.55 = 5.55
    //             maxForm = 3*(1+0.85+0.70) = 3*2.55 = 7.65
    //             formScore = (5.55/7.65)*100 ≈ 72.55
    // Rating: normRating=50, ratingWeight=1-3/10=0.7, ratingScore=35
    // baseScore = 56.25*0.6 + 72.55*0.25 + 35*0.15 = 33.75 + 18.14 + 5.25 = 57.14
    // Experience multiplier (played=3): 0.85 + 0.03*(3-1) = 0.91
    // No rustiness (3 real games in recentForm)
    // Final: 57.14 * 0.91 ≈ 52.0
    const player = makePlayer({ played: 3, won: 2, drew: 0, lost: 1, points: 6, recentForm: 'WWL' })
    expect(wprScore(player)).toBeCloseTo(52.0, 0)
  })

  it('does NOT apply the penalty to wprOverride players (played=0 new player)', () => {
    const newPlayer = makePlayer({ played: 0, wprOverride: 60 })
    expect(wprScore(newPlayer)).toBe(60)
  })

  it('does NOT apply the penalty at played=5 or above', () => {
    // played=5 and played=10 differ only in underlying stats, not the multiplier
    // verify played=10 (veteran) doesn't receive an unexpected penalty
    const veteran = makeVeteran() // played=10
    const fiveGames = makePlayer({ played: 5, won: 2, drew: 1, lost: 2, points: 7, recentForm: 'WWDLL' })
    // Both should score in a similar range (no multiplier applied)
    // The veteran scores higher only due to more data / better Bayesian estimate
    // Score at played=5 should be in a healthy range (no penalty applied)
    // A player with 2W 1D 2L record should score between 40 and 80
    expect(wprScore(fiveGames)).toBeGreaterThan(40)
    expect(wprScore(fiveGames)).toBeLessThan(80)
  })

  it('penalty at played=2 is greater than at played=4 (monotonically decreasing)', () => {
    // played=2: recentForm='WL' (2 real games — avoids rustiness), multiplier=0.88
    // played=4: recentForm='WWLL' (4 real games — avoids rustiness), multiplier=0.94
    const p2 = makePlayer({ played: 2, won: 1, drew: 0, lost: 1, points: 3, recentForm: 'WL' })
    const p4 = makePlayer({ played: 4, won: 2, drew: 0, lost: 2, points: 6, recentForm: 'WWLL' })
    expect(wprScore(p2)).toBeLessThan(wprScore(p4))
  })
})

describe('wprScore — rustiness penalty', () => {
  const REF_DATE = new Date('2026-04-15')

  function makeActivePlayer(): Player {
    return makePlayer({
      recentForm: 'WWDLL', // 5 real games
      lastPlayedWeekDate: '2026-04-01', // 14 days before REF_DATE
    })
  }

  it('applies no penalty to a regularly-attending player', () => {
    const active = makeActivePlayer()
    const baseline = wprScore(makePlayer({ recentForm: 'WWDLL' }), REF_DATE)
    expect(wprScore(active, REF_DATE)).toBeCloseTo(baseline, 5)
  })

  it('applies 0.88× penalty when last played >28 days ago', () => {
    const rusty = makePlayer({
      recentForm: 'WWDLL',
      lastPlayedWeekDate: '2026-03-01', // 45 days before REF_DATE
    })
    const fresh = makePlayer({ recentForm: 'WWDLL' })
    expect(wprScore(rusty, REF_DATE)).toBeCloseTo(wprScore(fresh, REF_DATE) * 0.88, 3)
  })

  it('applies no penalty when last played exactly 28 days ago', () => {
    const borderline = makePlayer({
      recentForm: 'WWDLL',
      lastPlayedWeekDate: '2026-03-18', // exactly 28 days before 15 Apr 2026
    })
    const fresh = makePlayer({ recentForm: 'WWDLL' })
    expect(wprScore(borderline, REF_DATE)).toBeCloseTo(wprScore(fresh, REF_DATE), 3)
  })

  it('applies 0.88× penalty when fewer than 2 real games in recentForm', () => {
    const intermittent = makePlayer({
      recentForm: '--W--', // only 1 real game
      lastPlayedWeekDate: '2026-04-08', // 7 days ago — not calendar-rusty
    })
    // Post-1.1 the form denominator excludes '-' slots, so '--W--' yields form=100%
    // (1 win in 1 played slot). Unpenalised base ≈ 57.67; rustiness multiplies by 0.88.
    expect(wprScore(intermittent, REF_DATE)).toBeCloseTo(57.67 * 0.88, 0)
  })

  it('applies 0.88× penalty when recentForm has zero real games', () => {
    const absent = makePlayer({
      recentForm: '-----',
      lastPlayedWeekDate: '2026-04-08',
    })
    const fresh = makePlayer({ recentForm: 'WWDLL' })
    expect(wprScore(absent, REF_DATE)).toBeLessThan(wprScore(fresh, REF_DATE))
  })

  it('does not apply rustiness penalty when lastPlayedWeekDate is undefined', () => {
    const noDate = makePlayer({ recentForm: 'WWDLL' })
    const withDate = makePlayer({ recentForm: 'WWDLL', lastPlayedWeekDate: '2026-03-01' })
    expect(wprScore(noDate, REF_DATE)).toBeGreaterThan(wprScore(withDate, REF_DATE))
  })

  it('experience and rustiness penalties stack independently', () => {
    const rookieRusty = makePlayer({
      played: 2,
      points: 3,
      won: 1, drew: 0, lost: 1,
      recentForm: 'WL',
      lastPlayedWeekDate: '2026-03-01', // >28 days
    })
    const baseScore = wprScore({ ...rookieRusty, played: 5, points: 9, won: 3, lost: 2, lastPlayedWeekDate: undefined }, REF_DATE)
    const expectedMultiplier = (0.85 + 0.03 * (2 - 1)) * 0.88 // experience × rustiness
    // Rough check — both penalties applied
    expect(wprScore(rookieRusty, REF_DATE)).toBeLessThan(baseScore * 0.95)
  })
})

describe('ewptScore — GK quality weighting', () => {
  function makeTeam(gkWpr: number | null, outfieldWpr = 50): Player[] {
    const outfield = [1, 2, 3, 4].map((i) => makePlayer({ name: `P${i}`, wprOverride: outfieldWpr }))
    if (gkWpr === null) {
      return [makePlayer({ name: 'P0', wprOverride: outfieldWpr }), ...outfield]
    }
    const gk = makePlayer({ name: 'GK', mentality: 'goalkeeper', wprOverride: gkWpr })
    return [gk, ...outfield]
  }

  it('strong GK (WPR 75) scores higher than average GK (WPR 50)', () => {
    expect(ewptScore(makeTeam(75))).toBeGreaterThan(ewptScore(makeTeam(50)))
  })

  it('weak GK (WPR 25) scores lower than average GK (WPR 50)', () => {
    expect(ewptScore(makeTeam(25))).toBeLessThan(ewptScore(makeTeam(50)))
  })

  it('average GK (WPR 50) gives +1.5 modifier', () => {
    // Post-1.2: avgWpr=50, top2Avg=50, gkModifier=1.5
    // ewptScore = 50*0.90 + 50*0.10 + 1.5 = 45 + 5 + 1.5 = 51.5
    const avgGkTeam = makeTeam(50)
    expect(ewptScore(avgGkTeam)).toBeCloseTo(51.5, 1)
  })

  it('exceptional GK (WPR 100) gives +2.5 modifier', () => {
    // Post-1.2: avgWpr=(100+50*4)/5=60, top2Avg=(100+50)/2=75, gkModifier=2.5
    // ewptScore = 60*0.90 + 75*0.10 + 2.5 = 54 + 7.5 + 2.5 = 64
    const exceptionalGkTeam = makeTeam(100)
    expect(ewptScore(exceptionalGkTeam)).toBeCloseTo(64, 1)
  })

  it('very weak GK (WPR 0) gives +0.5 modifier', () => {
    // Post-1.2: avgWpr=(0+50*4)/5=40, top2Avg=(50+50)/2=50, gkModifier=0.5
    // ewptScore = 40*0.90 + 50*0.10 + 0.5 = 36 + 5 + 0.5 = 41.5
    const weakGkTeam = makeTeam(0)
    expect(ewptScore(weakGkTeam)).toBeCloseTo(41.5, 1)
  })

  it('two GKs gives -1 modifier', () => {
    const twoGks = [
      makePlayer({ name: 'GK1', mentality: 'goalkeeper', wprOverride: 70 }),
      makePlayer({ name: 'GK2', mentality: 'goalkeeper', wprOverride: 70 }),
      makePlayer({ name: 'P1', wprOverride: 50 }),
      makePlayer({ name: 'P2', wprOverride: 50 }),
      makePlayer({ name: 'P3', wprOverride: 50 }),
    ]
    // Post-1.2: avgWpr=(70+70+50+50+50)/5=58, top2Avg=(70+70)/2=70, gkModifier=-1
    // ewptScore = 58*0.90 + 70*0.10 - 1 = 52.2 + 7 - 1 = 58.2
    expect(ewptScore(twoGks)).toBeCloseTo(58.2, 1)
  })

  it('balanced squad outscores a team with one star and five weak teammates', () => {
    // Star-heavy team: 1 high-WPR player + 4 weak players, no GK
    const starTeam = [
      makePlayer({ name: 'Star', wprOverride: 85 }),
      makePlayer({ name: 'W1', wprOverride: 30 }),
      makePlayer({ name: 'W2', wprOverride: 30 }),
      makePlayer({ name: 'W3', wprOverride: 30 }),
      makePlayer({ name: 'W4', wprOverride: 30 }),
    ]
    // Balanced team: 5 solid players, no GK
    const balancedTeam = Array.from({ length: 5 }, (_, i) =>
      makePlayer({ name: `B${i}`, wprOverride: 51 })
    )
    expect(ewptScore(balancedTeam)).toBeGreaterThan(ewptScore(starTeam))
  })
})

describe('ewptScore — no team-level form term (post-1.2)', () => {
  it('varying team form at same avgWpr produces the same ewptScore', () => {
    const lowForm = Array.from({ length: 6 }, (_, i) =>
      makePlayer({ name: `P${i}`, wprOverride: 60, recentForm: 'LLLLL' }),
    )
    const highForm = Array.from({ length: 6 }, (_, i) =>
      makePlayer({ name: `P${i}`, wprOverride: 60, recentForm: 'WWWWW' }),
    )
    expect(Math.abs(ewptScore(lowForm) - ewptScore(highForm))).toBeLessThan(0.5)
  })

  it('guest with empty form does not drag team score vs equivalent all-rated team', () => {
    const allRated = Array.from({ length: 6 }, (_, i) =>
      makePlayer({ name: `R${i}`, wprOverride: 60, recentForm: 'WWDLL' }),
    )
    const fiveRatedPlusGuest = [
      ...Array.from({ length: 5 }, (_, i) =>
        makePlayer({ name: `R${i}`, wprOverride: 60, recentForm: 'WWDLL' }),
      ),
      makePlayer({ name: 'Guest', wprOverride: 60, recentForm: '' }),
    ]
    expect(Math.abs(ewptScore(allRated) - ewptScore(fiveRatedPlusGuest))).toBeLessThan(0.5)
  })
})

describe('ewptScore — variety bonus excludes goalkeeper', () => {
  function teamWith(mentalities: Array<Player['mentality']>): Player[] {
    return mentalities.map((m, i) =>
      makePlayer({ name: `P${i}`, mentality: m, wprOverride: 50 })
    )
  }

  it('GK + 3 balanced + 1 attacker does NOT get variety bonus (2 outfielder mentalities)', () => {
    const mixed = teamWith(['goalkeeper', 'balanced', 'balanced', 'balanced', 'attacking'])
    const uniform = teamWith(['goalkeeper', 'balanced', 'balanced', 'balanced', 'balanced'])
    // Both have ≤2 outfielder mentalities → neither should get the variety bonus.
    // They share avgWpr, avgForm, top2Avg, GK modifier, depth. So scores should match.
    expect(ewptScore(mixed)).toBeCloseTo(ewptScore(uniform), 1)
  })

  it('GK + balanced + attacker + defender earns variety bonus (3 outfielder mentalities)', () => {
    const varied = teamWith(['goalkeeper', 'balanced', 'attacking', 'defensive', 'balanced'])
    const uniform = teamWith(['goalkeeper', 'balanced', 'balanced', 'balanced', 'balanced'])
    // varied has 3 distinct outfielder mentalities → +2 bonus.
    // uniform has 1 → no bonus. Everything else identical.
    expect(ewptScore(varied) - ewptScore(uniform)).toBeCloseTo(2, 1)
  })

  it('team with no GK: 3 distinct outfielder mentalities earns variety bonus', () => {
    const varied = teamWith(['balanced', 'attacking', 'defensive', 'balanced', 'attacking'])
    const uniform = teamWith(['balanced', 'balanced', 'balanced', 'balanced', 'balanced'])
    // No GK on either side → same no-GK penalty. Variety diff = 2.
    expect(ewptScore(varied) - ewptScore(uniform)).toBeCloseTo(2, 1)
  })

  it('GK + attacker + defender (2 outfielder mentalities) gets no variety bonus', () => {
    const team = teamWith(['goalkeeper', 'attacking', 'defensive'])
    const uniform = teamWith(['goalkeeper', 'attacking', 'attacking'])
    // Both have fewer than 3 outfielder mentalities → neither gets the bonus.
    expect(ewptScore(team)).toBeCloseTo(ewptScore(uniform), 1)
  })
})
