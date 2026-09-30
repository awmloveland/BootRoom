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
  themeColor: '#060b14',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark bg-[#060b14] scroll-smooth [scroll-padding-top:118px] ${spaceGrotesk.variable} ${plexMono.variable} ${inter.variable}`}
    >
      <body className="relative isolate font-grotesk bg-[#060b14] text-[#eaf2ff] antialiased min-h-screen">
        {/* Dot field — decorative, fades out down the page; sits behind all content */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 -z-10 h-[520px] pointer-events-none bg-[radial-gradient(#16283f_1.4px,transparent_1.4px)] bg-[length:24px_24px] [mask-image:linear-gradient(180deg,#000_0%,rgba(0,0,0,.4)_55%,transparent_100%)]"
        />
        <Navbar />
        {children}
      </body>
    </html>
  )
}
