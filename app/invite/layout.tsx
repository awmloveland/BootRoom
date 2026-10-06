import type { Metadata } from 'next'

// The tab title for /invite; page.tsx adds the preview tags for live invites.
export const metadata: Metadata = {
  title: 'League invite',
}

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
