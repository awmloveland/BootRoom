import type { Metadata } from 'next'

// The page does not export metadata of its own, so the tab title is set here.
export const metadata: Metadata = {
  title: 'Account',
}

export default function AccountSettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
