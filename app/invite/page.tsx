'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function InviteCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
        {children}
      </div>
    </div>
  )
}

function InviteFlow() {
  const params = useSearchParams()
  const token = params.get('token')?.trim() ?? ''

  if (!token) {
    return (
      <InviteCard>
        <h1 className="text-lg font-semibold text-slate-100">This invite link is no longer valid</h1>
        <p className="text-sm text-slate-400">
          It may have expired or been revoked. Ask the league admin for a fresh link.
        </p>
        <a
          href="/"
          className="inline-block w-full text-center py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors"
        >
          Back to home
        </a>
      </InviteCard>
    )
  }

  return (
    <InviteCard>
      <p className="text-slate-400 text-sm">Loading invite…</p>
    </InviteCard>
  )
}

export default function InvitePage() {
  return (
    <Suspense fallback={
      <InviteCard><p className="text-slate-400 text-sm">Loading…</p></InviteCard>
    }>
      <InviteFlow />
    </Suspense>
  )
}
