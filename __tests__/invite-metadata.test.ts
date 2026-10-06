import { loadInvitePreview } from '@/lib/shareLinksServer'

jest.mock('@/lib/shareLinksServer', () => ({ loadInvitePreview: jest.fn() }))
jest.mock('@/components/InviteAccept', () => ({ InviteAccept: () => null }))

import { generateMetadata } from '@/app/invite/page'

function call(searchParams: Record<string, string | string[] | undefined>) {
  return generateMetadata({ searchParams: Promise.resolve(searchParams) })
}

beforeEach(() => jest.resetAllMocks())

describe('invite page metadata', () => {
  it('adds the invite preview for a live invite', async () => {
    ;(loadInvitePreview as jest.Mock).mockResolvedValue({ leagueName: 'The Boot Room' })
    const meta = await call({ token: 'abc' })
    expect(loadInvitePreview).toHaveBeenCalledWith('abc')
    expect(meta.openGraph?.title).toBe('Join The Boot Room on Craft Football')
    expect(meta.openGraph?.images).toEqual([expect.objectContaining({ url: '/api/og/invite?token=abc' })])
  })

  it('adds nothing for a dead or missing invite', async () => {
    ;(loadInvitePreview as jest.Mock).mockResolvedValue(null)
    expect(await call({ token: 'abc' })).toEqual({})
    expect(await call({})).toEqual({})
  })
})
