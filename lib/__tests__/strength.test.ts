import { strengthToRating, ratingToStrength } from '@/lib/strength'

describe('strengthToRating', () => {
  it('maps below to 1', () => {
    expect(strengthToRating('below')).toBe(1)
  })
  it('maps average to 2', () => {
    expect(strengthToRating('average')).toBe(2)
  })
  it('maps above to 3', () => {
    expect(strengthToRating('above')).toBe(3)
  })
})

describe('ratingToStrength', () => {
  it('maps 1 to below', () => {
    expect(ratingToStrength(1)).toBe('below')
  })
  it('maps 2 to average', () => {
    expect(ratingToStrength(2)).toBe('average')
  })
  it('maps 3 to above', () => {
    expect(ratingToStrength(3)).toBe('above')
  })
  it('maps 0 (unset) to null', () => {
    expect(ratingToStrength(0)).toBeNull()
  })
  it('maps out-of-range values to null', () => {
    expect(ratingToStrength(99)).toBeNull()
  })
})
