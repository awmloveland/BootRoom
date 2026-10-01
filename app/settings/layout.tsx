import type { Metadata } from 'next'

// The account page is a client component, so its tab title is set here.
export const metadata: Metadata = {
  title: 'Account',
}

export default function AccountSettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
