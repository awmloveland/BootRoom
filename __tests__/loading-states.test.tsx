/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createClient } from '@/lib/supabase/client'
import { Skeleton, SkeletonCard, SkeletonList, SKELETON_FADE_IN } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { NextMatchCard } from '@/components/NextMatchCard'
import { AuthDialog } from '@/components/AuthDialog'
import PlayerClaimPicker from '@/components/PlayerClaimPicker'
import MemberLinkPicker from '@/components/MemberLinkPicker'

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))

/** A promise that never settles, so components stay in their loading state. */
const pending = () => new Promise<never>(() => {})

beforeEach(() => {
  jest.clearAllMocks()
})

describe('skeleton primitives', () => {
  it('Skeleton is a pulsing block sized by its caller', () => {
    const { container } = render(<Skeleton className="h-3 w-20" />)
    expect(container.firstChild).toHaveClass('animate-pulse', 'h-3', 'w-20')
  })

  it('SkeletonCard renders a header band and the requested rows', () => {
    const { container } = render(<SkeletonCard rows={3} />)
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(4)
  })

  it('SkeletonList is busy, fades in, and renders the requested rows', () => {
    const { container } = render(<SkeletonList rows={4} />)
    expect(container.firstChild).toHaveAttribute('aria-busy', 'true')
    expect(container.firstChild).toHaveClass(...SKELETON_FADE_IN.split(' '))
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(4)
  })
})

describe('Spinner', () => {
  it('announces a status with a readable label', () => {
    render(<Spinner label="Signing you in" />)
    expect(screen.getByRole('status')).toHaveTextContent('Signing you in')
  })
})

describe('pickers', () => {
  beforeEach(() => {
    global.fetch = jest.fn(pending) as unknown as typeof fetch
  })

  it('PlayerClaimPicker shows skeleton rows, not text, while loading', () => {
    const { container } = render(<PlayerClaimPicker leagueId="g1" onClaim={jest.fn()} onCancel={jest.fn()} />)
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })

  it('MemberLinkPicker shows skeleton rows, not text, while loading', () => {
    const { container } = render(<MemberLinkPicker leagueId="g1" onLink={jest.fn()} onCancel={jest.fn()} />)
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })
})

describe('NextMatchCard on Results', () => {
  it('holds its space with a placeholder while the scheduled week loads', () => {
    const query = { select: () => query, eq: () => query, in: () => query, order: () => query, limit: () => query, maybeSingle: pending }
    ;(createClient as jest.Mock).mockReturnValue({ from: () => query })

    const { container } = render(
      <NextMatchCard gameId="g1" leagueSlug="the-boot-room" weeks={[]} onResultSaved={jest.fn()} canEdit />
    )
    expect(container.firstChild).toHaveAttribute('aria-busy', 'true')
  })
})

describe('AuthDialog after a verified code', () => {
  it('stays open in a signing-in state until the page navigates away', async () => {
    const auth = {
      signInWithOtp: jest.fn().mockResolvedValue({ error: null }),
      verifyOtp: jest.fn().mockResolvedValue({ error: null }),
    }
    ;(createClient as jest.Mock).mockReturnValue({ auth, rpc: jest.fn().mockResolvedValue({ error: null }) })
    const onOpenChange = jest.fn()

    render(<AuthDialog open onOpenChange={onOpenChange} redirect="/the-boot-room/results" signinOnly />)

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@example.com' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send code' })) })
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Verify' })) })

    expect(screen.getByRole('heading', { name: 'Signing you in' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Signing you in')
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})
