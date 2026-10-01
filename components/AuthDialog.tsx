'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

type AuthMode = 'signin' | 'signup'
type AuthStep = 'details' | 'verify' | 'redirecting'

interface AuthDialogProps {
  /** Where to redirect after successful sign-in */
  redirect?: string
  /** Button size variant */
  size?: 'xs' | 'sm' | 'default'
  /** Optional custom trigger. Receives a function to open the sign-in dialog. */
  trigger?: (openSignIn: () => void) => React.ReactNode
  /** Displayed in the signup form description */
  leagueName?: string
  /** Defaults to 'signin' */
  initialMode?: AuthMode
  /** Controlled open state (optional) */
  open?: boolean
  /** Controlled open change handler (optional) */
  onOpenChange?: (open: boolean) => void
  signinOnly?: boolean
}

const inputClass =
  'w-full px-4 py-2 rounded-xl bg-[#0a1421] border border-[#1b2c46] text-[#f4f9ff] placeholder:text-[#4f688a] focus:outline-none focus:ring-0 focus:border-[#38bdf8]'

function VerifyStep({
  email,
  onBack,
  onVerified,
  redirect,
}: {
  email: string
  onBack: () => void
  onVerified: () => void
  redirect: string
}) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 6) {
      setMessage({ type: 'error', text: 'Enter the 6-digit code from your email.' })
      return
    }
    setLoading(true)
    setMessage(null)
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
    if (error) {
      setMessage({ type: 'error', text: 'Invalid or expired code. Try sending a new one.' })
      setLoading(false)
      return
    }
    const { error: claimErr } = await supabase.rpc('claim_profile')
    if (claimErr) {
      setMessage({ type: 'error', text: `Profile setup failed: ${claimErr.message}` })
      setLoading(false)
      return
    }
    // Keep the dialog up in its redirecting state until the browser unloads
    // the page, so nothing underneath changes while the next page loads.
    onVerified()
    window.location.href = redirect
  }

  async function handleResend() {
    setResending(true)
    setMessage(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: 'Code resent. Check your email.' })
    }
    setResending(false)
  }

  return (
    <form onSubmit={handleVerify} className="space-y-4 mt-4">
      <p className="text-sm text-[#8ba4c4]">
        We sent a 6-digit code to <span className="text-[#dff1ff]">{email}</span>
      </p>
      <div>
        <label htmlFor="otp-code" className="block text-sm text-[#8ba4c4] mb-1">
          Code
        </label>
        <input
          id="otp-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          required
          className={cn(inputClass, 'tracking-[0.5em] text-center text-lg font-mono')}
          placeholder="------"
        />
      </div>
      {message && (
        <p className={cn('text-sm', message.type === 'success' ? 'text-[#38bdf8]' : 'text-[#e2686f]')}>
          {message.text}
        </p>
      )}
      <button
        type="submit"
        disabled={loading || code.length !== 6}
        className="w-full py-2 px-4 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Verifying…' : 'Verify'}
      </button>
      <div className="flex items-center gap-3 text-sm">
        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="text-[#38bdf8] hover:text-[#7dd3fc] disabled:opacity-50"
        >
          {resending ? 'Sending…' : 'Resend code'}
        </button>
        <span className="text-[#4f688a]">&middot;</span>
        <button
          type="button"
          onClick={onBack}
          className="text-[#8ba4c4] hover:text-[#cfe0f4]"
        >
          ← Back
        </button>
      </div>
    </form>
  )
}

function SignInForm({
  onSent,
  onSwitchMode,
  signinOnly,
}: {
  onSent: (email: string) => void
  onSwitchMode: () => void
  signinOnly?: boolean
}) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false },
    })
    if (error) {
      setError(
        /user.not.found|no user|signups not allowed/i.test(error.message)
          ? signinOnly
            ? "No account found for this email. Ask your admin for an invite."
            : "No account found for this email. Use 'Create account' to get started."
          : error.message
      )
      setLoading(false)
      return
    }
    setLoading(false)
    onSent(email.trim().toLowerCase())
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div>
        <label htmlFor="signin-email" className="block text-sm text-[#8ba4c4] mb-1">
          Email
        </label>
        <input
          id="signin-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={inputClass}
          placeholder="you@example.com"
        />
      </div>
      {error && <p className="text-sm text-[#e2686f]">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 px-4 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Sending…' : 'Send code'}
      </button>
      {signinOnly ? (
        <p className="text-xs text-[#6f88a8] text-center">
          Don&apos;t have an account? Ask your admin for an invite or hit &apos;Join League&apos; to request access.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#1b2c46]" />
            <span className="text-xs text-[#6f88a8]">or</span>
            <div className="flex-1 h-px bg-[#1b2c46]" />
          </div>
          <button
            type="button"
            onClick={onSwitchMode}
            className="w-full py-2 px-4 rounded-lg bg-[#1b2c46] border border-[#223a5c] text-[#dff1ff] font-medium hover:bg-[#223a5c] transition-colors"
          >
            Create account
          </button>
        </>
      )}
    </form>
  )
}

function SignUpForm({
  onSent,
  onSwitchMode,
  leagueName,
}: {
  onSent: (email: string) => void
  onSwitchMode: () => void
  leagueName?: string
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const displayName = `${firstName.trim()} ${lastName.trim()}`.trim()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: true,
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          display_name: displayName,
        },
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setLoading(false)
    onSent(email.trim().toLowerCase())
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="signup-first" className="block text-sm text-[#8ba4c4] mb-1">
            First name
          </label>
          <input
            id="signup-first"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            className={inputClass}
            placeholder="Alex"
          />
        </div>
        <div>
          <label htmlFor="signup-last" className="block text-sm text-[#8ba4c4] mb-1">
            Last name
          </label>
          <input
            id="signup-last"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            className={inputClass}
            placeholder="Smith"
          />
        </div>
      </div>
      <div>
        <label htmlFor="signup-email" className="block text-sm text-[#8ba4c4] mb-1">
          Email
        </label>
        <input
          id="signup-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={inputClass}
          placeholder="you@example.com"
        />
      </div>
      {leagueName && (
        <p className="text-xs text-[#6f88a8]">
          You&apos;ll be able to request access to {leagueName} after creating your account.
        </p>
      )}
      {error && <p className="text-sm text-[#e2686f]">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 px-4 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Sending…' : 'Send code'}
      </button>
      <p className="text-xs text-[#6f88a8] text-center pt-1">
        Already have an account?{' '}
        <button type="button" onClick={onSwitchMode} className="text-[#8ba4c4] hover:text-[#dff1ff] underline">
          Sign in
        </button>
      </p>
    </form>
  )
}

const TITLES: Record<AuthMode, string> = {
  signin: 'Sign in',
  signup: 'Create account',
}

function getDescription(mode: AuthMode, leagueName?: string): string {
  if (mode === 'signup') {
    return leagueName
      ? `Create an account to request access to ${leagueName}.`
      : 'Create your Boot Room account.'
  }
  return 'Sign in to access your leagues.'
}

export function AuthDialog({
  redirect = '/',
  size = 'xs',
  trigger,
  leagueName,
  initialMode = 'signin',
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  signinOnly,
}: AuthDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [step, setStep] = useState<AuthStep>('details')
  const [email, setEmail] = useState('')

  const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled ? controlledOnOpenChange : setInternalOpen

  function openAs(m: AuthMode) {
    setMode(m)
    setStep('details')
    setEmail('')
    setOpen(true)
  }

  function handleOpenChange(next: boolean) {
    if (step === 'redirecting') return
    if (!next) {
      setStep('details')
      setEmail('')
    }
    setOpen(next)
  }

  function handleCodeSent(sentEmail: string) {
    setEmail(sentEmail)
    setStep('verify')
  }

  function handleBack() {
    setStep('details')
    setEmail('')
  }

  function handleSwitchMode() {
    if (signinOnly) return
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
    setStep('details')
    setEmail('')
  }

  const dialogTitle =
    step === 'redirecting' ? 'Signing you in' : step === 'verify' ? 'Check your email' : TITLES[mode]
  const dialogDescription =
    step === 'redirecting'
      ? 'Taking you to your league.'
      : step === 'verify'
        ? `Enter the 6-digit code we sent to ${email}`
        : getDescription(mode, leagueName)

  return (
    <>
      {!isControlled && (
        trigger ? (
          trigger(() => openAs('signin'))
        ) : (
          <Button size={size} variant="outline" onClick={() => openAs('signin')}>
            Log in
          </Button>
        )
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>

          {step === 'redirecting' ? (
            <div className="flex justify-center py-6">
              <Spinner className="size-6" label="Signing you in" />
            </div>
          ) : step === 'verify' ? (
            <VerifyStep
              email={email}
              onBack={handleBack}
              onVerified={() => setStep('redirecting')}
              redirect={redirect}
            />
          ) : mode === 'signin' ? (
            <SignInForm onSent={handleCodeSent} onSwitchMode={handleSwitchMode} signinOnly={signinOnly} />
          ) : (
            <SignUpForm
              onSent={handleCodeSent}
              onSwitchMode={handleSwitchMode}
              leagueName={leagueName}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
