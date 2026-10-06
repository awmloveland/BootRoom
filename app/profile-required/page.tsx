'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Where the proxy sends a signed-in user with no profiles row. Signing in
 * normally creates the profile (claim_profile), so this finishes that step,
 * or signs them out to start again.
 */
export default function ProfileRequiredPage() {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function finishSetup() {
    setBusy(true)
    setFailed(false)
    const { error } = await createClient().rpc('claim_profile')
    if (error) {
      setFailed(true)
      setBusy(false)
      return
    }
    window.location.href = '/'
  }

  async function signOut() {
    setBusy(true)
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' }).catch(() => {})
    window.location.href = '/sign-in'
  }

  return (
    <main className="mx-auto flex max-w-md flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
      <h1 className="mb-2 text-base font-semibold text-[#f4f9ff]">Finish setting up your account</h1>
      <p className="mb-6 text-sm text-[#6f88a8]">
        {failed
          ? 'That did not work. Sign out and sign in again to try once more.'
          : 'Your account is missing a profile. Finish setting it up to carry on.'}
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={signOut}
          disabled={busy}
          className="rounded-md border border-[#223a5c] bg-[#1b2c46] px-5 py-2 text-sm font-medium text-[#f4f9ff] transition-colors hover:bg-[#223a5c] disabled:opacity-50"
        >
          Sign out
        </button>
        {!failed && (
          <button
            onClick={finishSetup}
            disabled={busy}
            className="rounded bg-[#38bdf8] px-5 py-2 text-sm font-bold text-[#05101d] transition-colors hover:bg-[#7dd3fc] disabled:opacity-50"
          >
            Finish setting up
          </button>
        )}
      </div>
    </main>
  )
}
