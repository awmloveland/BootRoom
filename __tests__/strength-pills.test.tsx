import { render, screen, fireEvent } from '@testing-library/react'
import { StrengthPills } from '@/components/ui/StrengthPills'

describe('StrengthPills', () => {
  it('renders three labelled pills', () => {
    render(<StrengthPills value={null} onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Below average' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Average' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Above average' })).toBeInTheDocument()
  })

  it('marks none selected when value is null', () => {
    render(<StrengthPills value={null} onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Below average' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'Average' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'Above average' })).toHaveAttribute('aria-checked', 'false')
  })

  it('marks the matching pill selected when value is set', () => {
    render(<StrengthPills value="above" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Above average' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Average' })).toHaveAttribute('aria-checked', 'false')
  })

  it('fires onChange with the clicked value', () => {
    const onChange = jest.fn()
    render(<StrengthPills value={null} onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Below average' }))
    expect(onChange).toHaveBeenCalledWith('below')
  })

  it('does not fire onChange when disabled', () => {
    const onChange = jest.fn()
    render(<StrengthPills value={null} onChange={onChange} disabled />)
    fireEvent.click(screen.getByRole('radio', { name: 'Average' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
