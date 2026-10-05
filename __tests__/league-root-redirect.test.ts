import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'

jest.mock('next/navigation', () => ({ redirect: jest.fn() }))
jest.mock('next/headers', () => ({ headers: jest.fn(), cookies: jest.fn() }))

import LeagueRootPage from '@/app/[slug]/page'

function run(searchParams: Record<string, string | string[] | undefined>) {
  return LeagueRootPage({
    params: Promise.resolve({ slug: 'the-boot-room' }),
    searchParams: Promise.resolve(searchParams),
  })
}

beforeEach(() => {
  jest.resetAllMocks()
  ;(headers as jest.Mock).mockResolvedValue(new Headers({ 'user-agent': 'WhatsApp/2.23.20.0' }))
  ;(cookies as jest.Mock).mockResolvedValue({ get: () => undefined })
})

describe('league root redirect', () => {
  it('redirects to the landing tab with no query', async () => {
    await run({})
    expect(redirect).toHaveBeenCalledWith('/the-boot-room/results')
  })

  it('keeps ?lineup= so the landing tab can build the preview', async () => {
    await run({ lineup: 'Pyt4HppNTm-LehwtPk9aaw.abcdefghijklmnop' })
    expect(redirect).toHaveBeenCalledWith('/the-boot-room/results?lineup=Pyt4HppNTm-LehwtPk9aaw.abcdefghijklmnop')
  })

  it('drops repeated (array) params', async () => {
    await run({ a: ['1', '2'] })
    expect(redirect).toHaveBeenCalledWith('/the-boot-room/results')
  })
})
