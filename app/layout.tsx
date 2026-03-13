import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL('https://craft-football.com'),
  title: 'Craft Football',
  description: 'Match history browser for The Boot Room 5-a-side league.',
  openGraph: {
    title: 'Craft Football',
    description: 'Match history browser for The Boot Room 5-a-side league.',
    url: 'https://craft-football.com',
    siteName: 'Craft Football',
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-slate-900 text-slate-100 antialiased`}>
        {children}
      </body>
    </html>
  )
}
