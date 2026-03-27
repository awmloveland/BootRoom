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

type AuthMode = 'signin' | 'signup' | 'forgot'

interface AuthDialogProps {
  /** Where to redirect after successful sign-in/sign-up */
  redirect?: string
  /** Button size variant */
  size?: 'xs' | 'sm' | 'default'
  /** Optional custom trigger. Receives a function to open the sign-in dialog. */
  trigger?: (openSignIn: () => void) => React.ReactNode
}

function AuthForm({
  mode,
  setMode,
  redirect,
  onSuccess,
}: {
  mode: AuthMode
  setMode: (m: AuthMode) => void
  redirect: string
  onSuccess: () => void
}) {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: username.trim() || email.split('@')[0],
              name: username.trim() || email.split('@')[0],
            },
          },
        })
        if (error) {
          const errMsg = error.message
          if (/already exists|already registered/i.test(errMsg)) {
            setMessage({ type: 'error', text: errMsg })
            setMode('forgot')
          } else {
            throw new Error(errMsg)
          }
          return
        }
        if (data.session) {
          const { error: claimErr } = await supabase.rpc('claim_profile')
          if (claimErr) {
            setMessage({ type: 'error', text: `Profile setup failed: ${claimErr.message}` })
            return
          }
          onSuccess()
          router.push(redirect)
          router.refresh()
          return
        }
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
        if (!signInErr) {
          const { error: claimErr } = await supabase.rpc('claim_profile')
          if (!claimErr) {
            onSuccess()
            router.push(redirect)
            router.refresh()
            return
          }
        }
        setMessage({
          type: 'success',
          text: 'Account created. Check your email and click the confirmation link, then sign in below.',
        })
        setMode('signin')
        setUsername('')
        setPassword('')
      } else {
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
      }
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
        {mode === 'signup' && (
          <div>
            <label htmlFor="auth-username" className="block text-sm text-slate-400 mb-1">Username</label>
            <input
              id="auth-username"
              name="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              placeholder="Your name"
            />
          </div>
        )}

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
            minLength={mode === 'signup' ? 6 : undefined}
            className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            placeholder={mode === 'signup' ? 'At least 6 characters' : undefined}
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
          {loading ? 'Please wait\u2026' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <div className="mt-4 space-y-2">
        <button
          type="button"
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(null) }}
          className="block text-sm text-slate-400 hover:text-slate-300"
        >
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
        {mode === 'signin' && (
          <button
            type="button"
            onClick={() => { setMode('forgot'); setMessage(null) }}
            className="block text-sm text-slate-400 hover:text-slate-300"
          >
            Forgot password?
          </button>
        )}
      </div>
    </>
  )
}

const TITLES: Record<AuthMode, string> = {
  signin: 'Sign in',
  signup: 'Create account',
  forgot: 'Reset password',
}

export function AuthDialog({ redirect = '/', size = 'xs', trigger }: AuthDialogProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<AuthMode>('signin')

  function openAs(m: AuthMode) {
    setMode(m)
    setOpen(true)
  }

  return (
    <>
      {trigger
        ? trigger(() => openAs('signin'))
        : (
          <div className="flex items-center gap-2">
            <Button size={size} onClick={() => openAs('signin')}>
              Log in
            </Button>
            <Button size={size} variant="secondary" onClick={() => openAs('signup')}>
              Join
            </Button>
          </div>
        )
      }

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{TITLES[mode]}</DialogTitle>
            <DialogDescription>
              {mode === 'signup'
                ? 'Create a new account to join a league.'
                : mode === 'forgot'
                  ? 'We\u2019ll send you a reset link.'
                  : 'Sign in to access your leagues.'}
            </DialogDescription>
          </DialogHeader>
          <AuthForm
            mode={mode}
            setMode={setMode}
            redirect={redirect}
            onSuccess={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
