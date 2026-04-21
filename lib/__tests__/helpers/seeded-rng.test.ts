import { seededRng } from './seeded-rng'

describe('seededRng — LCG helper', () => {
  it('produces an identical first-5 sequence for the same seed across instances', () => {
    const first = Array.from({ length: 5 }, () => seededRng(42)())
    // Each invocation constructs a fresh rng and reads the first value — verifying
    // determinism of the first step.
    const again = Array.from({ length: 5 }, () => seededRng(42)())
    expect(first).toEqual(again)
  })

  it('produces the same sequence when read in order from one instance', () => {
    const rngA = seededRng(42)
    const rngB = seededRng(42)
    const seqA = Array.from({ length: 5 }, () => rngA())
    const seqB = Array.from({ length: 5 }, () => rngB())
    expect(seqA).toEqual(seqB)
  })

  it('produces different sequences for different seeds', () => {
    const seqA = Array.from({ length: 5 }, seededRng(42))
    const seqB = Array.from({ length: 5 }, seededRng(43))
    expect(seqA).not.toEqual(seqB)
  })

  it('returns values in [0, 1)', () => {
    const rng = seededRng(42)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})
