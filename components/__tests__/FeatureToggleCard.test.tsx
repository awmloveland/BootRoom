/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FeatureToggleCard } from '@/components/FeatureToggleCard'
import type { LeagueFeature } from '@/lib/types'

const FEATURE: LeagueFeature = {
  feature: 'lineup_share_image',
  available: true,
  enabled: false,
  config: null,
  public_enabled: false,
  public_config: null,
}

describe('FeatureToggleCard', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch
  })

  it('renders the title and description', () => {
    render(
      <FeatureToggleCard
        leagueId="game-1"
        feature={FEATURE}
        title="Lineup Share Image"
        description="Add a picture of both teams to shared lineup links."
        onChanged={jest.fn()}
      />
    )
    expect(screen.getByText('Lineup Share Image')).toBeInTheDocument()
    expect(screen.getByText('Add a picture of both teams to shared lineup links.')).toBeInTheDocument()
  })

  it('PATCHes the members toggle and reports the change', async () => {
    const onChanged = jest.fn()
    render(
      <FeatureToggleCard leagueId="game-1" feature={FEATURE} title="T" description="D" onChanged={onChanged} />
    )
    fireEvent.click(screen.getAllByRole('switch')[0])
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('/api/league/game-1/features')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ ...FEATURE, enabled: true })
  })

  it('PATCHes the public toggle', async () => {
    render(
      <FeatureToggleCard leagueId="game-1" feature={FEATURE} title="T" description="D" onChanged={jest.fn()} />
    )
    fireEvent.click(screen.getAllByRole('switch')[1])
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({ ...FEATURE, public_enabled: true })
  })
})
