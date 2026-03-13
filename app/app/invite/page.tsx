'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'

function InviteAcceptForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams?.get('token') ?? null
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setErrorMsg('Missing invite token')
      setStatus('error')
      return
    }

    async function accept() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        const redirect = `/invite?token=${encodeURIComponent(token!)}`
        router.replace(`/sign-in?redirect=${encodeURIComponent(redirect)}`)
        return
      }

      const { data, error } = await supabase.rpc('accept_game_invite', {
        invite_token: token,
      })

      if (error) {
        setErrorMsg(error.message || 'Invalid or expired invite')
        setStatus('error')
        return
      }

      setStatus('success')
      router.replace('/')
      router.refresh()
    }

    accept()
  }, [token, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Accepting invite…</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-slate-900">
        <Header />
        <main className="max-w-md mx-auto px-4 sm:px-6 py-12 text-center">
          <h1 className="text-xl font-semibold text-slate-100 mb-2">Couldn&apos;t accept invite</h1>
          <p className="text-slate-400 text-sm mb-6">{errorMsg}</p>
          <a
            href="/"
            className="inline-block px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium"
          >
            Back to app
          </a>
        </main>
      </div>
    )
  }

  return null
}

export default function InviteAcceptPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    }>
      <InviteAcceptForm />
    </Suspense>
  )
}
