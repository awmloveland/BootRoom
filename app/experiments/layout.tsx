import type { Metadata } from 'next'

// The experiments page is a client component, so its tab title is set here.
export const metadata: Metadata = {
  title: 'Experiments',
}

export default function ExperimentsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
