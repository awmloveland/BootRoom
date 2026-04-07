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
}

const inputClass =
  'w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent'

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
}: {
  onSent: (email: string) => void
  onSwitchMode: () => void
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
          ? "No account found for this email. Use 'Create account' to get started."
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
        onClick={onSwitchMode}
        className="w-full py-2 px-4 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 font-medium hover:bg-slate-600 transition-colors"
      >
        Create account
      </button>
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
      <button
        type="button"
        onClick={onSwitchMode}
        className="w-full py-2 px-4 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 font-medium hover:bg-slate-600 transition-colors"
      >
        Sign in instead
      </button>
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
            <SignInForm onSent={handleCodeSent} onSwitchMode={handleSwitchMode} />
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
