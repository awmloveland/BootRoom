import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, Inter, Space_Grotesk } from 'next/font/google'
import { Navbar } from '@/components/ui/navbar'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk' })
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-mono',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://craft-football.com'),
  title: 'Craft Football',
  description: 'Results, stats and fair teams for your weekly game.',
  openGraph: {
    title: 'Craft Football',
    description: 'Results, stats and fair teams for your weekly game.',
    url: 'https://craft-football.com',
    siteName: 'Craft Football',
  },
}

export const viewport: Viewport = {
  themeColor: '#0f172a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark bg-slate-900 scroll-smooth [scroll-padding-top:118px] ${spaceGrotesk.variable} ${plexMono.variable} ${inter.variable}`}
    >
      <body className={`${inter.className} bg-slate-900 text-slate-100 antialiased min-h-screen`}>
        <Navbar />
        {children}
      </body>
    </html>
  )
}
