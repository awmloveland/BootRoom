import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Navbar } from '@/components/ui/navbar'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL('https://craft-football.com'),
  title: 'Crafted Football',
  description: 'Match history browser for The Boot Room 5-a-side league.',
  openGraph: {
    title: 'Crafted Football',
    description: 'Match history browser for The Boot Room 5-a-side league.',
    url: 'https://craft-football.com',
    siteName: 'Crafted Football',
  },
  themeColor: '#0f172a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark bg-slate-900">
      <body className={`${inter.className} bg-slate-900 text-slate-100 antialiased min-h-screen`}>
        <Navbar />
        {children}
      </body>
    </html>
  )
}
