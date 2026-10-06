'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import { AuthDialog } from '@/components/AuthDialog'

interface SignInPromptProps {
  /** Same-site path to return to once signed in. */
  redirect: string
  /** Shown instead of opening the dialog straight away, e.g. after a failed sign-in link. */
  error?: string | null
}

/**
 * The /sign-in page body. Opens the shared sign-in dialog straight away, and
 * leaves a Log in button behind it if the dialog is closed.
 */
export function SignInPrompt({ redirect, error = null }: SignInPromptProps) {
  const [open, setOpen] = useState(!error)

  return (
    <main className="flex flex-col items-center justify-center gap-4 px-4 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-full border border-[#1b2c46] bg-[#0a1421]">
        <Lock size={22} className="text-[#6f88a8]" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <h1 className="text-base font-semibold text-[#f4f9ff]">Sign in to continue</h1>
        <p className={error ? 'max-w-xs text-sm text-[#e2686f]' : 'max-w-xs text-sm text-[#6f88a8]'}>
          {error ?? 'You need to be signed in to see that page.'}
        </p>
      </div>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-[#223a5c] bg-[#1b2c46] px-5 py-2 text-sm font-medium text-[#f4f9ff] transition-colors hover:bg-[#223a5c]"
      >
        Log in
      </button>
      <AuthDialog open={open} onOpenChange={setOpen} redirect={redirect} signinOnly />
    </main>
  )
}
