/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { AdminMoneyView } from '@/components/admin/AdminMoneyView'
import { applyOverlay, pruneOverlay } from '@/components/admin/useOptimisticMap'
import type { Week } from '@/lib/types'

const refresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => '/the-boot-room/admin',
  useSelectedLayoutSegment: () => 'admin',
}))

const WEEKS: Week[] = [
  { id: 'w1', season: '2026', week: 40, date: '01 Oct 2026', status: 'played', teamA: ['Marcus Reid', 'Marcus Reid +1'], teamB: ['Callum Shaw'], winner: 'teamA' },
  { id: 'w2', season: '2026', week: 39, date: '24 Sep 2026', status: 'played', teamA: ['Marcus Reid'], teamB: ['Callum Shaw'], winner: 'draw' },
  { id: 'w3', season: '2026', week: 38, date: '17 Sep 2026', status: 'cancelled', teamA: [], teamB: [], winner: null },
]

function renderView(payments: Record<string, boolean> = { 'w1|Callum Shaw': true }) {
  return render(
    <AdminMoneyView
      leagueId="game-1"
      leagueName="Hackney Thursdays"
      weeks={WEEKS}
      defaultFee={6}
      fees={{}}
      payments={payments}
      initialRange={{ preset: '30' }}
      today="2026-10-06"
    />
  )
}

const whoOwes = () => screen.getByRole('region', { name: 'Who owes' })
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

beforeEach(() => {
  refresh.mockClear()
  global.fetch = jest.fn().mockResolvedValue({ ok: true }) as jest.Mock
})

describe('AdminMoneyView', () => {
  it('shows the total owed, debtors and the per-game breakdown', () => {
    renderView()
    // Marcus: 2 own games + 1 guest at £6; Callum: 1 unpaid.
    expect(screen.getAllByText('£24').length).toBeGreaterThan(0)
    expect(within(whoOwes()).getByText('Marcus Reid')).toBeInTheDocument()
    expect(within(whoOwes()).getByText('2 of 2 games unpaid · 1 guest')).toBeInTheDocument()
    expect(screen.getByText('2 players · £24')).toBeInTheDocument()
  })

  it('ticks a game optimistically, saves it and refreshes', async () => {
    renderView()
    fireEvent.click(within(whoOwes()).getByText('Callum Shaw'))
    fireEvent.click(screen.getByRole('checkbox', { name: /24 Sep 2026, £6, unpaid/ }))
    // Callum is now square, so he moves to Settled straight away.
    expect(within(whoOwes()).queryByText('Callum Shaw')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Settled' })).getByText('Callum Shaw')).toBeInTheDocument()
    await flush()
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/league/game-1/weeks/w2/payments',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ payer: 'Callum Shaw', paid: true }) })
    )
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('Mark all paid settles own and guest games in range', async () => {
    renderView()
    fireEvent.click(within(whoOwes()).getByText('Marcus Reid'))
    fireEvent.click(screen.getByRole('button', { name: /mark all paid/i }))
    expect(within(whoOwes()).queryByText('Marcus Reid')).not.toBeInTheDocument()
    await flush()
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/league/game-1/payments/settle',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ player: 'Marcus Reid', weekIds: ['w1', 'w2'] }) })
    )
  })

  it('reverts a failed save and says so', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false })
    renderView()
    fireEvent.click(within(whoOwes()).getByText('Callum Shaw'))
    fireEvent.click(screen.getByRole('checkbox', { name: /24 Sep 2026, £6, unpaid/ }))
    await flush()
    expect(within(whoOwes()).getByText('Callum Shaw')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Could not save that change. Try again.')
  })

  it('lists cancelled weeks in Games without a cost', () => {
    renderView()
    expect(screen.getAllByText('2 played · 1 cancelled').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Week 38 · cancelled').length).toBeGreaterThan(0)
  })

  it('overrides a game cost and clears it with an empty field', async () => {
    renderView()
    fireEvent.click(screen.getAllByRole('button', { name: /Cost per player for week 39/ })[0])
    const input = screen.getByRole('spinbutton', { name: 'Cost per player for week 39' })
    fireEvent.change(input, { target: { value: '4.5' } })
    fireEvent.blur(input)
    expect(screen.getAllByRole('button', { name: /week 39: £4.50, overridden/ }).length).toBeGreaterThan(0)
    await flush()
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/league/game-1/weeks/w2/fee',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ fee: 4.5 }) })
    )
  })

  it('opens the share sheet with the plain-text breakdown', () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { name: 'Share breakdown' }))
    const sheet = screen.getByRole('dialog')
    expect(sheet).toHaveTextContent('Hackney Thursdays · Money owed')
    expect(sheet).toHaveTextContent('Marcus Reid · £18')
    expect(sheet.textContent).not.toMatch(/—/)
  })
})

describe('optimistic overlay', () => {
  it('applies pending changes, with null removing a row', () => {
    expect(applyOverlay({ a: 1, b: 2 }, { b: null, c: 3 })).toEqual({ a: 1, c: 3 })
  })

  it('drops changes once the server agrees', () => {
    expect(pruneOverlay({ a: 1, b: null, c: 5 }, { a: 1, c: 4 })).toEqual({ c: 5 })
  })
})
