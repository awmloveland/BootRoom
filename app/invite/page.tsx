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
  | { kind: 'mismatch'; targetEmail: string; currentEmail: string }
  | { kind: 'error'; message: string }

function InviteCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#060b14] flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-[#0a1421] border border-[#1b2c46] rounded-xl p-6 space-y-4">
        {children}
      </div>
    </div>
  )
}

function InvalidInviteCard() {
  return (
    <InviteCard>
      <h1 className="text-lg font-semibold text-[#f4f9ff]">This invite link is no longer valid</h1>
      <p className="text-sm text-[#8ba4c4]">
        It may have expired or been revoked. Ask the league admin for a fresh link.
      </p>
      <a
        href="/"
        className="inline-block w-full text-center py-2 px-4 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] font-bold transition-colors"
      >
        Back to home
      </a>
    </InviteCard>
  )
}

function MismatchCard({ token, targetEmail, currentEmail }: {
  token: string
  targetEmail: string
  currentEmail: string
}) {
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = `/invite?token=${encodeURIComponent(token)}`
  }

  return (
    <InviteCard>
      <h1 className="text-lg font-semibold text-[#f4f9ff]">This invite is for a different email</h1>
      <p className="text-sm text-[#8ba4c4]">
        It was sent to <span className="text-[#dff1ff]">{targetEmail}</span> but you&apos;re signed in as{' '}
        <span className="text-[#dff1ff]">{currentEmail}</span>.
      </p>
      <button
        type="button"
        disabled={signingOut}
        onClick={handleSignOut}
        className="w-full py-2 px-4 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {signingOut ? 'Signing out…' : 'Sign out and try again'}
      </button>
    </InviteCard>
  )
}

function GenericErrorCard({ message }: { message: string }) {
  return (
    <InviteCard>
      <h1 className="text-lg font-semibold text-[#f4f9ff]">Couldn&apos;t accept this invite</h1>
      <p className="text-sm text-[#8ba4c4]">{message}</p>
      <a
        href="/"
        className="inline-block w-full text-center py-2 px-4 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] font-bold transition-colors"
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

      if (preview.target_email && user.email && preview.target_email.toLowerCase() !== user.email.toLowerCase()) {
        setState({
          kind: 'mismatch',
          targetEmail: preview.target_email,
          currentEmail: user.email,
        })
        return
      }

      setState({ kind: 'joining', preview })

      const { error: acceptErr } = await supabase.rpc('accept_game_invite', {
        invite_token: token,
      })
      if (cancelled) return
      if (acceptErr) {
        if (/not authenticated/i.test(acceptErr.message)) {
          // Session was lost between getUser() and the RPC. Fall back to
          // the unauthenticated path so the user can sign in again.
          setState({ kind: 'preview', preview })
          return
        }
        if (/invalid or expired invite/i.test(acceptErr.message)) {
          // Invite was deleted/expired in the window between preview and accept.
          setState({ kind: 'invalid' })
          return
        }
        setState({ kind: 'error', message: acceptErr.message })
        return
      }

      // Full-page navigation so middleware re-runs and the new
      // game_members row is visible to the league pages.
      window.location.href = `/${preview.league_slug}`
    }
    run()
    return () => { cancelled = true }
  }, [token])

  if (state.kind === 'loading') {
    return <InviteCard><p className="text-[#8ba4c4] text-sm">Loading invite…</p></InviteCard>
  }
  if (state.kind === 'invalid') {
    return <InvalidInviteCard />
  }
  if (state.kind === 'joining') {
    return <InviteCard><p className="text-[#8ba4c4] text-sm">Joining {state.preview.league_name}…</p></InviteCard>
  }
  if (state.kind === 'mismatch') {
    return (
      <MismatchCard
        token={token}
        targetEmail={state.targetEmail}
        currentEmail={state.currentEmail}
      />
    )
  }
  if (state.kind === 'error') {
    return <GenericErrorCard message={state.message} />
  }

  // state.kind === 'preview' — unauthenticated visitor
  return (
    <>
      <InviteCard>
        <h1 className="text-lg font-semibold text-[#f4f9ff]">
          You&apos;ve been invited to join {state.preview.league_name}
        </h1>
        <p className="text-sm text-[#8ba4c4]">
          Sign in or create an account to join as a <span className="text-[#dff1ff]">{state.preview.role}</span>.
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
      <InviteCard><p className="text-[#8ba4c4] text-sm">Loading…</p></InviteCard>
    }>
      <InviteFlow />
    </Suspense>
  )
}
