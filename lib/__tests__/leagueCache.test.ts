import { revalidateTag } from 'next/cache'
import { revalidateLeague } from '@/lib/leagueCache'

jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }))

describe('revalidateLeague', () => {
  beforeEach(() => (revalidateTag as jest.Mock).mockClear())

  it('expires the league tag', () => {
    revalidateLeague('g1')
    expect(revalidateTag).toHaveBeenCalledTimes(1)
    expect(revalidateTag).toHaveBeenCalledWith('league:g1', { expire: 0 })
  })

  it('expires every slug tag it is given', () => {
    revalidateLeague('g1', ['old-slug', 'new-slug'])
    expect(revalidateTag).toHaveBeenCalledTimes(3)
    expect(revalidateTag).toHaveBeenCalledWith('league-slug:old-slug', { expire: 0 })
    expect(revalidateTag).toHaveBeenCalledWith('league-slug:new-slug', { expire: 0 })
  })
})
