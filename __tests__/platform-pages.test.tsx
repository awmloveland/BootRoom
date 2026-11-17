/**
 * @jest-environment jsdom
 */
// __tests__/platform-pages.test.tsx
// Both platform pages check the viewer themselves: this is the page-level gate.
import { render, screen } from '@testing-library/react'
import { getUser } from '@/lib/fetchers'
import { createServiceClient } from '@/lib/supabase/service'
import type { PlatformLeague } from '@/lib/types'

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))
jest.mock('@/lib/fetchers', () => ({ getUser: jest.fn() }))
jest.mock('@/lib/supabase/service', () => ({ createServiceClient: jest.fn() }))

import PlatformPage from '@/app/platform/page'
import PlatformLeaguePage from '@/app/platform/[id]/page'

const ADMIN = { id: 'admin-1', email: 'admin@example.com' }
const LEAGUE: PlatformLeague = {
  id: 'g1', name: 'Thursday Night Fives', slug: 'thursday-night-fives-k7x', created_at: '2026-11-09T10:00:00Z',
  location: 'Riverside 3G', day: 'Thursday', kickoff_time: '18:30', creator_name: 'Marcus Reid', creator_email: 'marcus@example.com',
  members: 1, players: 14, results: 9, last_activity: new Date().toISOString(),
}

const ROWS: Record<string, unknown[]> = {
  platform_audit_log: [{ id: 'a1', actor_email: 'admin@example.com', game_name: 'Test League', game_slug: 'test-league-b3n', created_at: '2026-11-03T10:00:00Z' }],
  game_members: [{ user_id: 'u1', role: 'creator', joined_at: '2026-11-09T10:00:00Z' }],
  profiles: [{ id: 'u1', email: 'marcus@example.com', first_name: 'Marcus', last_name: 'Reid', display_name: null }],
  weeks: [{ id: 'w1', date: '12 Nov 2026', status: 'played', winner: 'teamA' }],
}

/** A service client whose every table read resolves to that table's ROWS. */
function mockService() {
  const from = (table: string) => {
    const result = { data: ROWS[table] ?? [], count: 27, error: null }
    const chain: Record<string, unknown> = { then: (resolve: (r: typeof result) => unknown) => resolve(result) }
    for (const m of ['select', 'eq', 'gte', 'in', 'order', 'limit']) chain[m] = () => chain
    return chain
  }
  ;(createServiceClient as jest.Mock).mockReturnValue({ from, rpc: jest.fn().mockResolvedValue({ data: [LEAGUE], error: null }) })
}

const saved = process.env.PLATFORM_ADMIN_IDS
beforeEach(() => {
  jest.clearAllMocks()
  process.env.PLATFORM_ADMIN_IDS = ADMIN.id
})
afterAll(() => {
  if (saved === undefined) delete process.env.PLATFORM_ADMIN_IDS
  else process.env.PLATFORM_ADMIN_IDS = saved
})

const PAGES = [
  ['/platform', () => PlatformPage()],
  ['/platform/[id]', () => PlatformLeaguePage({ params: Promise.resolve({ id: 'g1' }) })],
] as const

describe.each(PAGES)('%s', (_path, page) => {
  it.each([
    ['signed-out visitors', null],
    ['signed-in users who are not platform admins', { id: 'user-2', email: 'other@example.com' }],
  ])('is a 404 for %s, and reads nothing', async (_label, user) => {
    ;(getUser as jest.Mock).mockResolvedValue(user)
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('is a 404 for everyone while PLATFORM_ADMIN_IDS is unset', async () => {
    delete process.env.PLATFORM_ADMIN_IDS
    ;(getUser as jest.Mock).mockResolvedValue(ADMIN)
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(createServiceClient).not.toHaveBeenCalled()
  })
})

it('lists the leagues, totals and audit log for a platform admin', async () => {
  ;(getUser as jest.Mock).mockResolvedValue(ADMIN)
  mockService()
  render(await PlatformPage())
  expect(screen.getByRole('link', { name: /Thursday Night Fives/ })).toHaveAttribute('href', '/platform/g1')
  expect(screen.getAllByText('Active').length).toBeGreaterThan(0)
  expect(screen.getByText('27')).toBeInTheDocument()
  expect(screen.getByText(/admin@example.com deleted Test League/)).toBeInTheDocument()
})

it('shows one league with its members, weeks and the delete control', async () => {
  ;(getUser as jest.Mock).mockResolvedValue(ADMIN)
  mockService()
  render(await PlatformLeaguePage({ params: Promise.resolve({ id: 'g1' }) }))
  expect(screen.getByRole('heading', { name: 'Thursday Night Fives' })).toBeInTheDocument()
  expect(screen.getByText('Thursday · 6:30pm')).toBeInTheDocument()
  expect(screen.getByText(/marcus@example.com · joined 9 Nov 2026/)).toBeInTheDocument()
  expect(screen.getByText('Team A Won')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
})

it('is a 404 for a league id that does not exist', async () => {
  ;(getUser as jest.Mock).mockResolvedValue(ADMIN)
  mockService()
  await expect(PlatformLeaguePage({ params: Promise.resolve({ id: 'missing' }) })).rejects.toThrow('NEXT_NOT_FOUND')
})
