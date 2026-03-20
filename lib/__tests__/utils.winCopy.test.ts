import { winCopy } from '../utils'

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
