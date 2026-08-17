/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WaitlistForm } from '@/components/landing/WaitlistForm'

describe('WaitlistForm', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }) as jest.Mock
  })

  function fill(name: string, email: string) {
    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: name } })
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: email } })
  }

  it('submits a valid signup and shows the success panel', async () => {
    render(<WaitlistForm />)
    fill('Will', 'will@example.com')
    fireEvent.change(screen.getByPlaceholderText('City'), { target: { value: 'London' } })
    fireEvent.click(screen.getByRole('button', { name: '5s' }))
    fireEvent.click(screen.getByRole('button', { name: 'Register interest' }))
    await screen.findByText('You are on the list.')
    expect(global.fetch).toHaveBeenCalledWith('/api/waitlist', expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body).toEqual({ name: 'Will', email: 'will@example.com', city: 'London', format: '5', website: '' })
  })

  it('does not submit an invalid email and marks the field', async () => {
    render(<WaitlistForm />)
    fill('Will', 'not-an-email')
    fireEvent.click(screen.getByRole('button', { name: 'Register interest' }))
    expect(global.fetch).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('you@example.com')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows an error line when the request fails', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => ({}) })
    render(<WaitlistForm />)
    fill('Will', 'will@example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Register interest' }))
    await screen.findByText('Something went wrong, try again.')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Register interest' })).not.toBeDisabled()
    )
  })

  it('defaults the format to 7s', async () => {
    render(<WaitlistForm />)
    fill('Will', 'will@example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Register interest' }))
    await screen.findByText('You are on the list.')
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.format).toBe('7')
  })
})
