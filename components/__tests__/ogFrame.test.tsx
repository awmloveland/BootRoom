/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { GenericShareImage, MetaLine, OgIcon } from '@/components/og/frame'

describe('og frame', () => {
  it('renders the generic card with the tagline', () => {
    render(<GenericShareImage />)
    expect(screen.getByText('Craft Football')).toBeInTheDocument()
    expect(screen.getByText('Results, stats and fair teams for your weekly game.')).toBeInTheDocument()
  })

  it('renders both sides of the meta line', () => {
    render(<MetaLine left="The Boot Room · Week 41" right="Tue 06 Oct" />)
    expect(screen.getByText('The Boot Room · Week 41')).toBeInTheDocument()
    expect(screen.getByText('Tue 06 Oct')).toBeInTheDocument()
  })

  it('draws an icon in the given colour', () => {
    const { container } = render(<OgIcon name="award" size={24} color="#bef264" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('stroke', '#bef264')
    expect(svg?.querySelectorAll('path')).toHaveLength(1)
    expect(svg?.querySelectorAll('circle')).toHaveLength(1)
  })
})
