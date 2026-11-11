// components/new-league/AccountStep.tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { NO_ACCOUNT, resendCode, sendSignInCode, sendSignUpCode, verifyCode } from '@/lib/supabase/otp'
import { FIELD, NEW_VISITOR_COOKIE, OUTLINE_BUTTON, PRIMARY_BUTTON, SECONDARY_LINK, StepEyebrow, StepShell } from './StepShell'

type Stage = 'signup' | 'signin' | 'code'

/**
 * Step 1 for a signed-out visitor: create an account or sign in with an
 * email code. A verified code reloads the page at /new/name, signed in.
 */
export function AccountStep() {
  const [stage, setStage] = useState<Stage>('signup')
  // Where the code was sent from, so Change email returns there.
  const [from, setFrom] = useState<Exclude<Stage, 'code'>>('signup')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)

  const cleanEmail = email.trim().toLowerCase()
  const canSend = cleanEmail.includes('@') && (stage === 'signin' || (first.trim() !== '' && last.trim() !== ''))

  function switchTo(next: Exclude<Stage, 'code'>) {
    setStage(next)
    setMessage(null)
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!canSend || busy) return
    setBusy(true)
    setMessage(null)
    const err = stage === 'signin'
      ? await sendSignInCode(cleanEmail)
      : await sendSignUpCode(first.trim(), last.trim(), cleanEmail)
    setBusy(false)
    if (err) {
      setMessage({ error: true, text: NO_ACCOUNT.test(err) ? 'No account found for this email. Create one instead.' : err })
      return
    }
    setFrom(stage === 'signin' ? 'signin' : 'signup')
    setCode('')
    setStage('code')
  }

  async function resend() {
    setBusy(true)
    setMessage(null)
    const err = await resendCode(cleanEmail)
    setBusy(false)
    setMessage(err ? { error: true, text: err } : { error: false, text: 'Code resent. Check your email.' })
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 6 || busy) return
    setBusy(true)
    setMessage(null)
    const err = await verifyCode(cleanEmail, code)
    if (err) {
      setMessage({ error: true, text: err })
      setBusy(false)
      return
    }
    // The server pages read this to count Account as step 1 of 7 for the rest
    // of the flow. Busy stays true until the browser unloads the page.
    document.cookie = `${NEW_VISITOR_COOKIE}=1; path=/new; SameSite=Lax`
    window.location.href = '/new/name'
  }

  const feedback = message && (
    <p role={message.error ? 'alert' : 'status'} className={cn('mt-3 text-center font-inter-body text-[13px]', message.error ? 'text-[#e2686f]' : 'text-[#38bdf8]')}>
      {message.text}
    </p>
  )

  if (stage === 'code') {
    return (
      <form onSubmit={verify}>
        <StepShell
          eyebrow={<StepEyebrow n={0} offset={1} />}
          title="Check your email"
          sub={<>Enter the 6-digit code we sent to <span className="text-[#dff1ff]">{cleanEmail}</span></>}
          action={
            <>
              <button type="submit" className={PRIMARY_BUTTON} disabled={code.length !== 6 || busy}>
                {busy ? 'Checking…' : 'Continue'}
              </button>
              {feedback}
            </>
          }
          secondary={
            <span className="inline-flex items-center gap-3">
              <button type="button" className={SECONDARY_LINK} disabled={busy} onClick={resend}>Resend code</button>
              <span className="text-[#4f688a]">·</span>
              <button type="button" className={SECONDARY_LINK} disabled={busy} onClick={() => switchTo(from)}>Change email</button>
            </span>
          }
        >
          <input
            aria-label="6-digit code"
            className="h-16 w-full rounded-lg border border-[#38bdf8] bg-[#0a1421] text-center font-plex text-[26px] font-bold tracking-[.5em] text-[#f4f9ff] placeholder:text-[#4f688a] focus:outline-none"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="------"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            autoFocus
          />
        </StepShell>
      </form>
    )
  }

  const signin = stage === 'signin'
  return (
    <form onSubmit={send}>
      <StepShell
        eyebrow={<StepEyebrow n={0} offset={1} />}
        title={signin ? 'Welcome back' : 'First, who are you?'}
        sub={signin
          ? 'Sign in and we will pick up where you left off.'
          : 'You will be the admin of this league. Use the name your teammates know you by; it becomes your player.'}
        action={
          <>
            <button type="submit" className={PRIMARY_BUTTON} disabled={!canSend || busy}>
              {busy ? 'Sending…' : 'Send code'}
            </button>
            {feedback}
            <div className="mt-[18px] flex items-center gap-3">
              <span className="h-px flex-1 bg-[#1b2c46]" />
              <span className="font-inter-body text-[12.5px] text-[#6f88a8]">or</span>
              <span className="h-px flex-1 bg-[#1b2c46]" />
            </div>
            <button type="button" className={cn(OUTLINE_BUTTON, 'mt-[18px]')} onClick={() => switchTo(signin ? 'signup' : 'signin')}>
              {signin ? 'Create an account instead' : 'I already have an account'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {!signin && (
            <div className="grid gap-3 sm:grid-cols-2">
              <input aria-label="First name" className={FIELD} placeholder="First name" autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} autoFocus />
              <input aria-label="Last name" className={FIELD} placeholder="Last name" autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} />
            </div>
          )}
          <input aria-label="Email" type="email" className={FIELD} placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus={signin} />
          <p className="text-center font-inter-body text-[12.5px] text-[#6f88a8]">No password. We email you a 6-digit code.</p>
        </div>
      </StepShell>
    </form>
  )
}
