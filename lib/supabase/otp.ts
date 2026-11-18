// The Supabase Auth calls behind email codes, shared by the sign-in dialog
// (components/AuthForms.tsx) and the league setup Account step. Each returns
// an error message for the screen, or null on success. Callers pass emails
// already trimmed and lower-cased.
import { createClient } from '@/lib/supabase/client'

/** Supabase's wording when a sign-in is attempted for an email with no account. */
const NO_ACCOUNT = /user.not.found|no user|signups not allowed/i

/**
 * Answers an email with no account exactly as it answers a sent code, so the
 * form never confirms whether an email is registered. Never creates an account.
 */
export async function sendSignInCode(email: string): Promise<string | null> {
  const { error } = await createClient().auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
  return error && !NO_ACCOUNT.test(error.message) ? error.message : null
}

export async function sendSignUpCode(firstName: string, lastName: string, email: string): Promise<string | null> {
  const { error } = await createClient().auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: { first_name: firstName, last_name: lastName, display_name: `${firstName} ${lastName}`.trim() },
    },
  })
  return error?.message ?? null
}

/**
 * A second code for the same email, whichever way the first was requested.
 * A sign-up has already created the account by now, so this never needs to,
 * and a mistyped sign-in email must not become a new account on Resend.
 */
export const resendCode = sendSignInCode

/** Verifies the code and creates the profile row for a new account. */
export async function verifyCode(email: string, code: string): Promise<string | null> {
  const supabase = createClient()
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
  if (error) return 'Invalid or expired code. Try sending a new one.'
  const { error: claimErr } = await supabase.rpc('claim_profile')
  return claimErr ? `Profile setup failed: ${claimErr.message}` : null
}
