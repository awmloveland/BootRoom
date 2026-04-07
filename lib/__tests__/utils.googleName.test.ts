import { parseGoogleName } from '../utils'

describe('parseGoogleName', () => {
  it('uses given_name and family_name when present', () => {
    expect(parseGoogleName({ given_name: 'Lucia', family_name: 'Hormel' })).toEqual({
      firstName: 'Lucia',
      lastName: 'Hormel',
    })
  })

  it('uses given_name alone when family_name is absent', () => {
    expect(parseGoogleName({ given_name: 'Lucia' })).toEqual({
      firstName: 'Lucia',
      lastName: '',
    })
  })

  it('falls back to splitting full_name when given_name/family_name absent', () => {
    expect(parseGoogleName({ full_name: 'Lucia Hormel' })).toEqual({
      firstName: 'Lucia',
      lastName: 'Hormel',
    })
  })

  it('falls back to splitting name when full_name also absent', () => {
    expect(parseGoogleName({ name: 'Lucia Hormel' })).toEqual({
      firstName: 'Lucia',
      lastName: 'Hormel',
    })
  })

  it('handles single-word name (no last name)', () => {
    expect(parseGoogleName({ name: 'Lucia' })).toEqual({
      firstName: 'Lucia',
      lastName: '',
    })
  })

  it('handles multi-word last name', () => {
    expect(parseGoogleName({ name: 'Mary Jo Smith' })).toEqual({
      firstName: 'Mary',
      lastName: 'Jo Smith',
    })
  })

  it('returns empty strings when no metadata present', () => {
    expect(parseGoogleName({})).toEqual({ firstName: '', lastName: '' })
  })
})
