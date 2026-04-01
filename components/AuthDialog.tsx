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

type AuthMode = 'signin' | 'forgot' | 'signup'

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

function SignupForm({
  setMode,
  leagueName,
  onSuccess,
  onSignedUp,
}: {
  setMode: (m: AuthMode) => void
  leagueName?: string
  onSuccess: () => void
  onSignedUp?: () => void
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)

    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' })
      return
    }

    setLoading(true)

    const supabase = createClient()

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            display_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          },
        },
      })
      if (error) throw new Error(error.message)
      const { error: claimErr } = await supabase.rpc('claim_profile')
      if (claimErr) {
        setMessage({ type: 'error', text: `Profile setup failed: ${claimErr.message}` })
        return
      }
      onSuccess()
      onSignedUp?.()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setMessage({ type: 'error', text: msg })
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent'

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4 mt-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="signup-first-name" className="block text-sm text-slate-400 mb-1">
              First name
            </label>
            <input
              id="signup-first-name"
              name="first_name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className={inputClass}
              placeholder="Alex"
            />
          </div>
          <div>
            <label htmlFor="signup-last-name" className="block text-sm text-slate-400 mb-1">
              Last name
            </label>
            <input
              id="signup-last-name"
              name="last_name"
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
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={inputClass}
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="signup-password" className="block text-sm text-slate-400 mb-1">
            Password
          </label>
          <input
            id="signup-password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="signup-confirm-password" className="block text-sm text-slate-400 mb-1">
            Confirm password
          </label>
          <input
            id="signup-confirm-password"
            name="confirm_password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className={inputClass}
          />
        </div>

        {message && (
          <p className={cn('text-sm', message.type === 'success' ? 'text-sky-400' : 'text-red-400')}>
            {message.text}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Creating account\u2026' : 'Create account'}
        </button>
      </form>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => { setMode('signin'); setMessage(null) }}
          className="text-sm text-slate-400 hover:text-slate-300"
        >
          Already have an account? Sign in &rarr;
        </button>
      </div>
    </>
  )
}

function AuthForm({
  mode,
  setMode,
  redirect,
  onSuccess,
  leagueName,
  onSignedUp,
}: {
  mode: AuthMode
  setMode: (m: AuthMode) => void
  redirect: string
  onSuccess: () => void
  leagueName?: string
  onSignedUp?: () => void
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  if (mode === 'signup') {
    return (
      <SignupForm
        setMode={setMode}
        leagueName={leagueName}
        onSuccess={onSuccess}
        onSignedUp={onSignedUp}
      />
    )
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!email) {
      setMessage({ type: 'error', text: 'Enter your email first' })
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://m.craft-football.com'
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, redirect_base: baseUrl }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
      setMessage({ type: 'success', text: data.message ?? 'Check your email for the password reset link.' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const isNetwork = /fetch|network|connection|failed/i.test(msg)
      setMessage({
        type: 'error',
        text: isNetwork
          ? 'Network error. The API may be unreachable—check deployment or try again.'
          : msg,
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    const supabase = createClient()

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        let msg = error.message
        if (/invalid|credentials/i.test(msg)) {
          msg = 'Invalid email or password. Use "Forgot password?" to set a new one.'
        } else if (/email not confirmed/i.test(msg)) {
          msg = 'Check your email and click the confirmation link first.'
        }
        throw new Error(msg)
      }
      const { error: claimErr } = await supabase.rpc('claim_profile')
      if (claimErr) {
        setMessage({ type: 'error', text: `Profile setup failed: ${claimErr.message}` })
        return
      }
      onSuccess()
      router.push(redirect)
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const isNetwork = /fetch|network|connection|failed/i.test(msg)
      setMessage({
        type: 'error',
        text: isNetwork
          ? 'Network error. The API may be unreachable—check deployment or try again.'
          : msg,
      })
    } finally {
      setLoading(false)
    }
  }

  if (mode === 'forgot') {
    return (
      <form onSubmit={handleForgotPassword} className="space-y-4">
        <p className="text-slate-400 text-sm">
          Enter your email and we&apos;ll send you a link to set a new password.
        </p>
        <div>
          <label htmlFor="auth-email-forgot" className="block text-sm text-slate-400 mb-1">Email</label>
          <input
            id="auth-email-forgot"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            placeholder="you@example.com"
          />
        </div>
        {message && (
          <p className={cn('text-sm', message.type === 'success' ? 'text-sky-400' : 'text-red-400')}>
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50"
        >
          {loading ? 'Sending\u2026' : 'Send reset link'}
        </button>
        <button
          type="button"
          onClick={() => { setMode('signin'); setMessage(null) }}
          className="text-sm text-slate-400 hover:text-slate-300"
        >
          \u2190 Back to sign in
        </button>
      </form>
    )
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="auth-email" className="block text-sm text-slate-400 mb-1">Email</label>
          <input
            id="auth-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="auth-password" className="block text-sm text-slate-400 mb-1">Password</label>
          <input
            id="auth-password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />
        </div>

        {message && (
          <div className="space-y-1">
            <p className={cn('text-sm', message.type === 'success' ? 'text-sky-400' : 'text-red-400')}>
              {message.text}
            </p>
            {message.type === 'error' && /invalid|password/i.test(message.text) && (
              <button
                type="button"
                onClick={() => { setMode('forgot'); setMessage(null) }}
                className="text-sm text-sky-400 hover:text-sky-300 underline"
              >
                Reset password
              </button>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Please wait\u2026' : 'Sign in'}
        </button>
      </form>

      <div className="mt-4 space-y-2">
        <button
          type="button"
          onClick={() => { setMode('forgot'); setMessage(null) }}
          className="block text-sm text-slate-400 hover:text-slate-300"
        >
          Forgot password?
        </button>
        <button
          type="button"
          onClick={() => { setMode('signup'); setMessage(null) }}
          className="block text-sm text-slate-400 hover:text-slate-300"
        >
          New here? Create account
        </button>
      </div>
    </>
  )
}

const TITLES: Record<AuthMode, string> = {
  signin: 'Sign in',
  forgot: 'Reset password',
  signup: 'Create account',
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

  const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled ? controlledOnOpenChange : setInternalOpen

  function openAs(m: AuthMode) {
    setMode(m)
    setOpen(true)
  }

  function getDescription() {
    if (mode === 'forgot') return 'We\u2019ll send you a reset link.'
    if (mode === 'signup') {
      return leagueName
        ? `Create an account to request access to ${leagueName}.`
        : 'Create your Boot Room account.'
    }
    return 'Sign in to access your leagues.'
  }

  return (
    <>
      {!isControlled && (
        trigger
          ? trigger(() => openAs('signin'))
          : (
            <Button size={size} onClick={() => openAs('signin')}>
              Log in
            </Button>
          )
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{TITLES[mode]}</DialogTitle>
            <DialogDescription>
              {getDescription()}
            </DialogDescription>
          </DialogHeader>
          <AuthForm
            mode={mode}
            setMode={setMode}
            redirect={redirect}
            onSuccess={() => setOpen(false)}
            leagueName={leagueName}
            onSignedUp={onSignedUp}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
