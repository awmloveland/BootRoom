/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MentalityControl } from '@/components/ui/MentalityControl'

describe('MentalityControl', () => {
  it('marks the current mentality as pressed', () => {
    render(<MentalityControl value="attacking" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'ATT' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'GK' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onChange only when a different mentality is picked', () => {
    const onChange = jest.fn()
    render(<MentalityControl value="attacking" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'ATT' }))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'DEF' }))
    expect(onChange).toHaveBeenCalledWith('defensive')
  })
})
