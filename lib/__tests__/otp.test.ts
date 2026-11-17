import { createClient } from '@/lib/supabase/client'
import { resendCode, sendSignInCode } from '@/lib/supabase/otp'

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))

const signInWithOtp = jest.fn()
beforeEach(() => {
  signInWithOtp.mockReset()
  ;(createClient as jest.Mock).mockReturnValue({ auth: { signInWithOtp } })
})

describe('sendSignInCode', () => {
  it('answers an unknown email the same as a sent code', async () => {
    signInWithOtp.mockResolvedValue({ error: { message: 'Signups not allowed for otp' } })
    await expect(sendSignInCode('nobody@example.com')).resolves.toBeNull()
    expect(signInWithOtp).toHaveBeenCalledWith({ email: 'nobody@example.com', options: { shouldCreateUser: false } })
  })

  it('still reports other failures, such as rate limits', async () => {
    signInWithOtp.mockResolvedValue({ error: { message: 'Email rate limit exceeded' } })
    await expect(sendSignInCode('a@example.com')).resolves.toBe('Email rate limit exceeded')
  })
})

describe('resendCode', () => {
  it('never creates an account for a mistyped email', async () => {
    signInWithOtp.mockResolvedValue({ error: null })
    await resendCode('typo@example.com')
    expect(signInWithOtp).toHaveBeenCalledWith({ email: 'typo@example.com', options: { shouldCreateUser: false } })
  })
})
