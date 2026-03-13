'use client'

import { Header } from '@/components/Header'

export default function ProfileRequiredPage() {
  return (
    <div className="min-h-screen bg-slate-900">
      <Header />
      <main className="max-w-md mx-auto px-4 sm:px-6 py-12 flex flex-col items-center justify-center">
        <h1 className="text-xl font-semibold text-slate-100 mb-2">Profile required</h1>
        <p className="text-slate-400 text-sm mb-6 text-center">
          Your account is missing a profile. Sign out and sign in again, or contact support.
        </p>
        <button
          onClick={async () => {
            await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })
            window.location.href = '/sign-in'
          }}
          className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium transition-colors"
        >
          Sign out
        </button>
      </main>
    </div>
  )
}
