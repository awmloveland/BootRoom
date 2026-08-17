'use client'

import { AuthDialog } from '@/components/AuthDialog'

interface LoginLinkProps {
  className?: string
  children: React.ReactNode
}

/** Opens the shared sign-in dialog from landing-styled triggers. */
export function LoginLink({ className, children }: LoginLinkProps) {
  return (
    <AuthDialog
      redirect="/"
      signinOnly
      trigger={(openSignIn) => (
        <button type="button" onClick={openSignIn} className={className}>
          {children}
        </button>
      )}
    />
  )
}
