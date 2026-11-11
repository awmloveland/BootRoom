/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AccountStep } from '@/components/new-league/AccountStep'
import { sendSignInCode, sendSignUpCode } from '@/lib/supabase/otp'
import { StepEyebrow } from '@/components/new-league/StepShell'

jest.mock('@/lib/supabase/otp', () => ({
  NO_ACCOUNT: /no user/i,
  sendSignInCode: jest.fn(),
  sendSignUpCode: jest.fn(),
  resendCode: jest.fn(),
  verifyCode: jest.fn(),
}))

beforeEach(() => jest.resetAllMocks())

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('AccountStep', () => {
  it('enables Send code only with both names and an email containing @', () => {
    render(<AccountStep />)
    const send = screen.getByRole('button', { name: 'Send code' })
    expect(send).toBeDisabled()
    fill('First name', 'Ada')
    fill('Last name', 'Lovelace')
    fill('Email', 'ada')
    expect(send).toBeDisabled()
    fill('Email', 'ada@example.com')
    expect(send).toBeEnabled()
  })

  it('switches to sign in and back', () => {
    render(<AccountStep />)
    fireEvent.click(screen.getByRole('button', { name: 'I already have an account' }))
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.queryByLabelText('First name')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Create an account instead' }))
    expect(screen.getByRole('heading', { name: 'First, who are you?' })).toBeInTheDocument()
  })

  it('shows the code stage for the email after a successful send', async () => {
    ;(sendSignUpCode as jest.Mock).mockResolvedValue(null)
    render(<AccountStep />)
    fill('First name', 'Ada')
    fill('Last name', 'Lovelace')
    fill('Email', ' Ada@Example.com ')
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument())
    expect(sendSignUpCode).toHaveBeenCalledWith('Ada', 'Lovelace', 'ada@example.com')
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })

  it('explains a sign-in for an unknown email and re-enables Send code', async () => {
    ;(sendSignInCode as jest.Mock).mockResolvedValue('No user found')
    render(<AccountStep />)
    fireEvent.click(screen.getByRole('button', { name: 'I already have an account' }))
    fill('Email', 'new@example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No account found for this email. Create one instead.'))
    expect(screen.getByRole('button', { name: 'Send code' })).toBeEnabled()
  })
})

describe('StepEyebrow', () => {
  it('counts the Account step for visitors who came through it', () => {
    const { rerender } = render(<StepEyebrow n={2} />)
    expect(screen.getByText('Step 2/6')).toBeInTheDocument()
    rerender(<StepEyebrow n={2} offset={1} />)
    expect(screen.getByText('Step 3/7')).toBeInTheDocument()
  })
})
