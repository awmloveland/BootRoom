'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AuthDialog } from '@/components/AuthDialog'

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
  | { kind: 'joining'; preview: Preview }
  | { kind: 'error'; message: string }

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

function GenericErrorCard({ message }: { message: string }) {
  return (
    <InviteCard>
      <h1 className="text-lg font-semibold text-slate-100">Couldn&apos;t accept this invite</h1>
      <p className="text-sm text-slate-400">{message}</p>
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

      const { data: previewData, error: previewErr } = await supabase.rpc(
        'preview_invite',
        { invite_token: token }
      )
      if (cancelled) return
      const preview = (Array.isArray(previewData) ? previewData[0] : null) as Preview | null
      if (previewErr || !preview) {
        setState({ kind: 'invalid' })
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return

      if (!user) {
        setState({ kind: 'preview', preview })
        return
      }

      setState({ kind: 'joining', preview })

      const { error: acceptErr } = await supabase.rpc('accept_game_invite', {
        invite_token: token,
      })
      if (cancelled) return
      if (acceptErr) {
        setState({ kind: 'error', message: acceptErr.message })
        return
      }

      // Full-page navigation so middleware re-runs and the new
      // game_members row is visible to the league pages.
      window.location.href = `/${preview.league_slug}/results`
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
  if (state.kind === 'joining') {
    return <InviteCard><p className="text-slate-400 text-sm">Joining {state.preview.league_name}…</p></InviteCard>
  }
  if (state.kind === 'error') {
    return <GenericErrorCard message={state.message} />
  }

  // state.kind === 'preview' — unauthenticated visitor
  return (
    <>
      <InviteCard>
        <h1 className="text-lg font-semibold text-slate-100">
          You&apos;ve been invited to join {state.preview.league_name}
        </h1>
        <p className="text-sm text-slate-400">
          Sign in or create an account to join as a <span className="text-slate-200">{state.preview.role}</span>.
        </p>
      </InviteCard>
      <AuthDialog
        open
        onOpenChange={() => { /* dialog stays open — this page exists to capture the sign-in */ }}
        redirect={`/invite?token=${encodeURIComponent(token)}`}
        leagueName={state.preview.league_name}
        initialMode="signup"
      />
    </>
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
