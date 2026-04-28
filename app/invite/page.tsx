'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Preview = {
  league_name: string
  league_slug: string
  role: string
  target_email: string | null
}

type State =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'preview'; preview: Preview }

function InviteCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
        {children}
      </div>
    </div>
  )
}

function InvalidInviteCard() {
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

function InviteFlow() {
  const params = useSearchParams()
  const token = params.get('token')?.trim() ?? ''
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    if (!token) {
      setState({ kind: 'invalid' })
      return
    }
    let cancelled = false
    async function run() {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('preview_invite', { invite_token: token })
      if (cancelled) return
      const row = Array.isArray(data) ? data[0] : null
      if (error || !row) {
        setState({ kind: 'invalid' })
        return
      }
      setState({ kind: 'preview', preview: row as Preview })
    }
    run()
    return () => { cancelled = true }
  }, [token])

  if (state.kind === 'loading') {
    return <InviteCard><p className="text-slate-400 text-sm">Loading invite…</p></InviteCard>
  }
  if (state.kind === 'invalid') {
    return <InvalidInviteCard />
  }

  // state.kind === 'preview' — for now just dump the preview so we can verify
  // the RPC works end-to-end. Later tasks replace this with the real UI.
  return (
    <InviteCard>
      <p className="text-slate-400 text-sm">
        Preview loaded: {state.preview.league_name} ({state.preview.role})
      </p>
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
