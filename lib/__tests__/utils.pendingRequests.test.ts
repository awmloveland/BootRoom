import { pendingRequestsBannerText } from '@/lib/utils'

describe('pendingRequestsBannerText', () => {
  it('returns null when nothing is waiting', () => {
    expect(pendingRequestsBannerText({ joinNames: [], claimNames: [] })).toBeNull()
  })

  it('names a single person asking to join', () => {
    expect(pendingRequestsBannerText({ joinNames: ['Callum Shaw'], claimNames: [] })).toEqual({
      title: '1 person wants to join',
      detail: 'Callum Shaw',
    })
  })

  it('names several people asking to join', () => {
    expect(pendingRequestsBannerText({ joinNames: ['Callum Shaw', 'Priya Nair'], claimNames: [] })).toEqual({
      title: '2 people want to join',
      detail: 'Callum Shaw, Priya Nair',
    })
  })

  it('adds player claims to the detail line when there are join requests too', () => {
    expect(pendingRequestsBannerText({ joinNames: ['Callum Shaw', 'Priya Nair'], claimNames: ['Sofia Marsh'] })).toEqual({
      title: '2 people want to join',
      detail: 'Callum Shaw, Priya Nair · 1 player claim to review',
    })
    expect(
      pendingRequestsBannerText({ joinNames: ['Callum Shaw'], claimNames: ['Sofia Marsh', 'Rav Singh'] })?.detail
    ).toBe('Callum Shaw · 2 player claims to review')
  })

  it('leads with player claims when there are no join requests', () => {
    expect(pendingRequestsBannerText({ joinNames: [], claimNames: ['Sofia Marsh'] })).toEqual({
      title: '1 player claim to review',
      detail: 'Sofia Marsh',
    })
    expect(pendingRequestsBannerText({ joinNames: [], claimNames: ['Sofia Marsh', 'Rav Singh'] })?.title).toBe(
      '2 player claims to review'
    )
  })

  it('names the first three and counts the rest', () => {
    const joinNames = ['Callum Shaw', 'Priya Nair', 'Rav Singh', 'Sam Okafor', 'Leon Brooks']
    expect(pendingRequestsBannerText({ joinNames, claimNames: [] })).toEqual({
      title: '5 people want to join',
      detail: 'Callum Shaw, Priya Nair, Rav Singh and 2 more',
    })
  })
})
