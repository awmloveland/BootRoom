import { squadFormat } from '@/lib/utils'

describe('squadFormat', () => {
  it('names an even squad by its side size', () => {
    expect(squadFormat(10)).toBe('5-a-side')
    expect(squadFormat(14)).toBe('7-a-side')
  })

  it('names an odd squad by its uneven split', () => {
    expect(squadFormat(11)).toBe('6v5')
    expect(squadFormat(13)).toBe('7v6')
  })

  it('returns an empty string for an empty squad', () => {
    expect(squadFormat(0)).toBe('')
  })
})
