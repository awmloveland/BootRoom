import type { Metadata } from 'next'

// The invite page is a client component, so its tab title is set here.
export const metadata: Metadata = {
  title: 'League invite',
}

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
