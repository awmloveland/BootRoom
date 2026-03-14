'use client'

import Link from 'next/link'
import { usePathname, useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Menu } from 'lucide-react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

interface MenuItem {
  title: string
  url: string
  description?: string
  icon?: JSX.Element
  items?: MenuItem[]
}

interface NavbarProps {
  logo?: {
    url: string
    src: string
    alt: string
    title: string
  }
  menu?: MenuItem[]
  mobileExtraLinks?: { name: string; url: string }[]
  auth?: {
    login?: { text: string; url: string }
    signup?: { text: string; url: string }
    signOut?: { text: string; onSignOut: () => void }
  }
}

const defaultLogo = {
  url: '/',
  src: '/favicon.ico',
  alt: 'Craft Football',
  title: 'Craft Football',
}

function renderMobileMenuItem(item: MenuItem, isActive: boolean) {
  if (item.items) {
    return (
      <AccordionItem key={item.title} value={item.title} className="border-b-0">
        <AccordionTrigger className="py-0 font-semibold hover:no-underline">
          {item.title}
        </AccordionTrigger>
        <AccordionContent className="mt-2">
          {item.items.map((subItem) => (
            <Link
              key={subItem.title}
              className="flex select-none gap-4 rounded-md p-3 leading-none outline-none transition-colors hover:bg-muted hover:text-accent-foreground"
              href={subItem.url}
            >
              {subItem.icon}
              <div>
                <div className="text-sm font-semibold">{subItem.title}</div>
                {subItem.description && (
                  <p className="text-sm leading-snug text-muted-foreground">
                    {subItem.description}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </AccordionContent>
      </AccordionItem>
    )
  }

  return (
    <Link
      key={item.title}
      href={item.url}
      className={cn('font-semibold', isActive && 'text-foreground')}
    >
      {item.title}
    </Link>
  )
}

export function Navbar({
  logo = defaultLogo,
  menu = [],
  mobileExtraLinks = [],
  auth,
}: NavbarProps) {
  const pathname = usePathname()
  const params = useParams()
  const leagueId = params?.id as string | undefined
  const isLeagueDetail = !!pathname?.match(/^\/league\/[^/]+/)
  const isPlayersPage = pathname?.endsWith('/players')

  const [user, setUser] = useState<{ email?: string } | null>(null)
  const [leagueName, setLeagueName] = useState<string | null>(null)
  const [isLeagueAdmin, setIsLeagueAdmin] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const showNav = pathname !== '/sign-in' && pathname !== '/reset-password'

  useEffect(() => {
    setSheetOpen(false)
  }, [pathname])

  useEffect(() => {
    if (pathname === '/sign-in' || pathname === '/reset-password') return
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => setUser(data?.user ?? null))
  }, [pathname])

  useEffect(() => {
    if (!leagueId) {
      setLeagueName(null)
      setIsLeagueAdmin(false)
      return
    }
    fetch('/api/games', { credentials: 'include' })
      .then((res) => res.json().catch(() => []))
      .then((data: { id: string; name: string; role: string }[]) => {
        const game = (data ?? []).find((g) => g.id === leagueId)
        setLeagueName(game?.name ?? null)
        setIsLeagueAdmin(game?.role === 'creator' || game?.role === 'admin')
      })
      .catch(() => { setLeagueName(null); setIsLeagueAdmin(false) })
  }, [leagueId])

  async function handleSignOut() {
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })
    window.location.href = '/sign-in'
  }

  const resolvedMenu = menu.length > 0 ? menu : (() => {
    const items: MenuItem[] = [
      { title: 'Leagues', url: '/' },
      ...(leagueId
        ? [
            { title: 'Results', url: `/league/${leagueId}` },
            { title: 'Players', url: `/league/${leagueId}/players` },
            // Settings is only shown to admins/creators
            ...(isLeagueAdmin ? [{ title: 'Settings', url: `/league/${leagueId}/settings` }] : []),
          ]
        : []),
    ]
    return items
  })()

  const isSettingsPage = pathname === '/settings' || !!pathname?.match(/^\/league\/[^/]+\/settings$/)
  const isActive = (item: MenuItem) => {
    const isResults = item.title === 'Results'
    const isPlayers = item.title === 'Players'
    const isSettings = item.title === 'Settings'
    const isLeagues = item.title === 'Leagues'
    return (
      (isResults && isLeagueDetail && !isPlayersPage && !pathname?.endsWith('/settings')) ||
      (isPlayers && isPlayersPage) ||
      (isSettings && isSettingsPage) ||
      (isLeagues && (pathname === '/' || pathname === ''))
    )
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-700 bg-slate-900">
      {/* Action bar */}
      <div className="flex h-14 w-full max-w-2xl mx-auto items-center justify-between px-4 sm:px-6">
        {/* Logo — always left */}
        <Link href={logo.url} className="flex items-center gap-2 shrink-0">
          <span className="text-xl font-bold text-slate-100">⚽</span>
          <span className="text-lg font-semibold text-slate-100">{logo.title}</span>
        </Link>

        {/* Nav items + Sign out — right-aligned, grouped together */}
        <div className="hidden sm:flex items-center gap-6">
          {showNav && resolvedMenu.map((item) => (
            <Link
              key={item.title}
              href={item.url}
              className={cn(
                'text-sm font-medium transition-colors',
                isActive(item) ? 'text-slate-100' : 'text-slate-400 hover:text-slate-100'
              )}
            >
              {item.title}
            </Link>
          ))}
          {auth?.login && auth?.signup && !user && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={auth.login.url}>{auth.login.text}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href={auth.signup.url}>{auth.signup.text}</Link>
              </Button>
            </>
          )}
          {showNav && user && (
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          )}
        </div>

        {/* Mobile — hamburger only on very small screens */}
        <div className="flex sm:hidden items-center justify-between w-full">
          <Link href={logo.url} className="flex items-center gap-2 shrink-0 min-w-0">
            <span className="text-xl font-bold text-slate-100">⚽</span>
            <span className="text-lg font-semibold text-slate-100 truncate">{logo.title}</span>
          </Link>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="shrink-0">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent className="overflow-y-auto bg-slate-900 border-slate-700">
              <SheetHeader>
                <SheetTitle className="text-slate-100">Menu</SheetTitle>
              </SheetHeader>
              <div className="my-6 flex flex-col gap-6">
                {showNav && (
                  <Accordion
                    type="single"
                    collapsible
                    className="flex w-full flex-col gap-4"
                  >
                    {resolvedMenu.map((item) => renderMobileMenuItem(item, isActive(item)))}
                  </Accordion>
                )}
                {mobileExtraLinks.length > 0 && (
                  <div className="border-t border-slate-700 py-4">
                    <div className="grid grid-cols-2 justify-start">
                      {mobileExtraLinks.map((link, idx) => (
                        <Link
                          key={idx}
                          className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
                          href={link.url}
                        >
                          {link.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {showNav && user && (
                  <div className="flex flex-col gap-3">
                    <Button variant="outline" onClick={handleSignOut}>
                      Sign out
                    </Button>
                  </div>
                )}
                {auth?.login && auth?.signup && !user && (
                  <div className="flex flex-col gap-3">
                    <Button asChild variant="outline">
                      <Link href={auth.login.url}>{auth.login.text}</Link>
                    </Button>
                    <Button asChild>
                      <Link href={auth.signup.url}>{auth.signup.text}</Link>
                    </Button>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* League context bar — shown when a league is selected */}
      {leagueId && leagueName && showNav && (
        <div className="bg-slate-800/50 border-b border-slate-700">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-2">
            <p className="text-sm font-medium text-slate-300">{leagueName}</p>
          </div>
        </div>
      )}
    </header>
  )
}
