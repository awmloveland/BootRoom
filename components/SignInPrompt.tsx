'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import { AuthDialog } from '@/components/AuthDialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
        <p className={cn('max-w-xs text-sm', error ? 'text-[#e2686f]' : 'text-[#6f88a8]')}>
          {error ?? 'You need to be signed in to see that page.'}
        </p>
      </div>
      <Button onClick={() => setOpen(true)}>Log in</Button>
      <AuthDialog open={open} onOpenChange={setOpen} redirect={redirect} signinOnly />
    </main>
  )
}
