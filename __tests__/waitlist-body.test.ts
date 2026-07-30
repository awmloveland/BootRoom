import { parseWaitlistBody } from '@/lib/waitlist'

describe('parseWaitlistBody', () => {
  const valid = { name: 'Will', email: 'will@example.com', city: 'London', format: '7' }

  it('parses a valid body', () => {
    expect(parseWaitlistBody(valid)).toEqual({
      name: 'Will',
      email: 'will@example.com',
      city: 'London',
      format: '7',
    })
  })

  it('trims name and city, lowercases email', () => {
    expect(
      parseWaitlistBody({ name: '  Will ', email: ' Will@Example.COM ', city: '  London ', format: 'mixed' })
    ).toEqual({ name: 'Will', email: 'will@example.com', city: 'London', format: 'mixed' })
  })

  it('accepts a missing or empty city as null', () => {
    expect(parseWaitlistBody({ ...valid, city: undefined })).toEqual({ ...valid, city: null })
    expect(parseWaitlistBody({ ...valid, city: '   ' })).toEqual({ ...valid, city: null })
  })

  it('rejects missing or whitespace-only name', () => {
    expect(parseWaitlistBody({ ...valid, name: '' })).toBeNull()
    expect(parseWaitlistBody({ ...valid, name: '   ' })).toBeNull()
    expect(parseWaitlistBody({ ...valid, name: 42 })).toBeNull()
  })

  it('rejects invalid emails', () => {
    expect(parseWaitlistBody({ ...valid, email: 'not-an-email' })).toBeNull()
    expect(parseWaitlistBody({ ...valid, email: 'a@b' })).toBeNull()
    expect(parseWaitlistBody({ ...valid, email: '' })).toBeNull()
    expect(parseWaitlistBody({ ...valid, email: 7 })).toBeNull()
  })

  it('rejects invalid formats', () => {
    expect(parseWaitlistBody({ ...valid, format: '11' })).toBeNull()
    expect(parseWaitlistBody({ ...valid, format: undefined })).toBeNull()
  })

  it('rejects non-object bodies', () => {
    expect(parseWaitlistBody(null)).toBeNull()
    expect(parseWaitlistBody('hello')).toBeNull()
    expect(parseWaitlistBody([])).toBeNull()
  })
})
