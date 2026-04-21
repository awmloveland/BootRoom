/**
 * Linear Congruential Generator. Deterministic per seed.
 * Not cryptographically strong — test-use only.
 */
export function seededRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
}
