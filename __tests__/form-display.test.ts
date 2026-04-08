/**
 * The recentForm data string is stored newest-first (index 0 = most recent).
 * Display components must reverse it so the oldest result is on the left
 * and the most recent result is on the right — matching the football stats convention.
 */
function displayOrder(form: string): string[] {
  return [...form].reverse()
}

describe('form display order', () => {
  it('reverses a full 5-char form string so newest is last', () => {
    // data string: W=most recent, L=oldest
    expect(displayOrder('WWDLL')).toEqual(['L', 'L', 'D', 'W', 'W'])
  })

  it('handles a form string with placeholder dashes', () => {
    // '--WLW': most recent is W (index 0), two unplayed slots at end
    expect(displayOrder('--WLW')).toEqual(['W', 'L', 'W', '-', '-'])
  })

  it('handles a single-char form string', () => {
    expect(displayOrder('W')).toEqual(['W'])
  })

  it('handles an empty form string', () => {
    expect(displayOrder('')).toEqual([])
  })
})

describe('most recent circle position', () => {
  it('after reversal the last element is the most recent result', () => {
    // recentForm is stored newest-first: index 0 = most recent
    // after reversal: index 0 = oldest, last index = most recent
    const form = 'WDLWW' // index 0 (W) = most recent
    const reversed = [...form].reverse()
    expect(reversed[reversed.length - 1]).toBe('W') // most recent is rightmost
  })
})
