'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

type AuthMode = 'signin' | 'signup'
type AuthStep = 'details' | 'verify'

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
  /** Called after successful signup (parent opens JoinRequestDialog) */
  onSignedUp?: () => void
  /** Controlled open state (optional) */
  open?: boolean
  /** Controlled open change handler (optional) */
  onOpenChange?: (open: boolean) => void
  signinOnly?: boolean
}

const inputClass =
  'w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

async function handleGoogleSignIn(mode: AuthMode, redirect: string): Promise<string | null> {
  const supabase = createClient()
  const base = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`
  const redirectTo = mode === 'signup' ? `${base}&mode=signup` : base
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
  return error ? error.message : null
}

function VerifyStep({
  email,
  onBack,
  onSuccess,
  onSignedUp,
  redirect,
}: {
  email: string
  onBack: () => void
  onSuccess: () => void
  onSignedUp?: () => void
  redirect: string
}) {
  const router = useRouter()
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
    onSignedUp?.()
    onSuccess()
    router.push(redirect)
    router.refresh()
  }

  async function handleResend() {
    setResending(true)
    setMessage(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: 'Code resent — check your email.' })
    }
    setResending(false)
  }

  return (
    <form onSubmit={handleVerify} className="space-y-4 mt-4">
      <p className="text-sm text-slate-400">
        We sent a 6-digit code to <span className="text-slate-200">{email}</span>
      </p>
      <div>
        <label htmlFor="otp-code" className="block text-sm text-slate-400 mb-1">
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
          autoFocus
        />
      </div>
      {message && (
        <p className={cn('text-sm', message.type === 'success' ? 'text-sky-400' : 'text-red-400')}>
          {message.text}
        </p>
      )}
      <button
        type="submit"
        disabled={loading || code.length !== 6}
        className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Verifying…' : 'Verify'}
      </button>
      <div className="flex items-center gap-3 text-sm">
        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="text-sky-400 hover:text-sky-300 disabled:opacity-50"
        >
          {resending ? 'Sending…' : 'Resend code'}
        </button>
        <span className="text-slate-600">&middot;</span>
        <button
          type="button"
          onClick={onBack}
          className="text-slate-400 hover:text-slate-300"
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
  redirect,
  signinOnly,
}: {
  onSent: (email: string) => void
  onSwitchMode: () => void
  redirect: string
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
        <label htmlFor="signin-email" className="block text-sm text-slate-400 mb-1">
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
          autoFocus
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Sending…' : 'Send code'}
      </button>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-700" />
        <span className="text-xs text-slate-500">or</span>
        <div className="flex-1 h-px bg-slate-700" />
      </div>
      <button
        type="button"
        onClick={async () => {
          const err = await handleGoogleSignIn('signin', redirect)
          if (err) setError(err)
        }}
        className="w-full py-2 px-4 rounded-lg bg-slate-700 border border-slate-600 text-slate-100 font-medium hover:bg-slate-600 transition-colors flex items-center justify-center gap-2"
      >
        <GoogleIcon />
        Sign in with Google
      </button>
      {signinOnly ? (
        <p className="text-xs text-slate-500 text-center">
          Don&apos;t have an account? Ask your admin for an invite or hit &apos;Join League&apos; to request access.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-xs text-slate-500">or</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>
          <button
            type="button"
            onClick={onSwitchMode}
            className="w-full py-2 px-4 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 font-medium hover:bg-slate-600 transition-colors"
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
  redirect,
}: {
  onSent: (email: string) => void
  onSwitchMode: () => void
  leagueName?: string
  redirect: string
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [googleError, setGoogleError] = useState<string | null>(null)

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
          <label htmlFor="signup-first" className="block text-sm text-slate-400 mb-1">
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
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="signup-last" className="block text-sm text-slate-400 mb-1">
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
        <label htmlFor="signup-email" className="block text-sm text-slate-400 mb-1">
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
        <p className="text-xs text-slate-500">
          You&apos;ll be able to request access to {leagueName} after creating your account.
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Sending…' : 'Send code'}
      </button>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-700" />
        <span className="text-xs text-slate-500">or</span>
        <div className="flex-1 h-px bg-slate-700" />
      </div>
      {googleError && <p className="text-sm text-red-400">{googleError}</p>}
      <button
        type="button"
        onClick={async () => {
          setGoogleError(null)
          const err = await handleGoogleSignIn('signup', redirect)
          if (err) setGoogleError(err)
        }}
        className="w-full py-2 px-4 rounded-lg bg-slate-700 border border-slate-600 text-slate-100 font-medium hover:bg-slate-600 transition-colors flex items-center justify-center gap-2"
      >
        <GoogleIcon />
        Sign up with Google
      </button>
      <p className="text-xs text-slate-500 text-center pt-1">
        Already have an account?{' '}
        <button type="button" onClick={onSwitchMode} className="text-slate-400 hover:text-slate-200 underline">
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
  onSignedUp,
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

  const dialogTitle = step === 'verify' ? 'Check your email' : TITLES[mode]
  const dialogDescription =
    step === 'verify'
      ? `Enter the 6-digit code we sent to ${email}`
      : getDescription(mode, leagueName)

  return (
    <>
      {!isControlled && (
        trigger ? (
          trigger(() => openAs('signin'))
        ) : (
          <Button size={size} onClick={() => openAs('signin')}>
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

          {step === 'verify' ? (
            <VerifyStep
              email={email}
              onBack={handleBack}
              onSuccess={() => setOpen(false)}
              onSignedUp={onSignedUp}
              redirect={redirect}
            />
          ) : mode === 'signin' ? (
            <SignInForm onSent={handleCodeSent} onSwitchMode={handleSwitchMode} redirect={redirect} signinOnly={signinOnly} />
          ) : (
            <SignUpForm
              onSent={handleCodeSent}
              onSwitchMode={handleSwitchMode}
              leagueName={leagueName}
              redirect={redirect}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
