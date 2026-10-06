// app/sign-in/page.tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/fetchers'
import { safeRedirectPath } from '@/lib/utils'
import { SignInPrompt } from '@/components/SignInPrompt'

export const metadata: Metadata = { title: 'Sign in' }

interface Props {
  searchParams: Promise<{ redirect?: string; error?: string }>
}

const ERRORS: Record<string, string> = {
  auth_callback: 'That sign-in link did not work. It may have expired, so try again.',
}

/**
 * Where the proxy sends signed-out visitors to auth-only pages (league
 * Settings, account settings), with `?redirect=` to return them afterwards.
 * Already signed in? Go straight there.
 */
export default async function SignInPage({ searchParams }: Props) {
  const params = await searchParams
  const next = safeRedirectPath(params.redirect)
  if (await getUser()) redirect(next)
  return <SignInPrompt redirect={next} error={params.error ? (ERRORS[params.error] ?? null) : null} />
}
