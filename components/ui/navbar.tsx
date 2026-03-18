'use client'

import Link from 'next/link'
import { usePathname, useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Menu, Settings, User, LogOut, FlaskConical } from 'lucide-react'

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
import { AuthDialog } from '@/components/AuthDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { fetchWeeks } from '@/lib/data'

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
  alt: 'Crafted Football',
  title: 'Crafted Football',
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

  if (item.title === 'Settings') {
    return (
      <Link
        key={item.title}
        href={item.url}
        className={cn('flex items-center gap-2 font-semibold', isActive && 'text-foreground')}
      >
        <Settings className="size-4" />
        Settings
      </Link>
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
  const leagueId = (params as { leagueId?: string })?.leagueId
  const isLeagueDetail = !!pathname?.match(/^\/[0-9a-f-]{36}\/(results|players|settings)/)
  const isPlayersPage = !!pathname?.match(/^\/[^/]+\/players$/)

  const [user, setUser] = useState<{ id?: string; email?: string } | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [profileRole, setProfileRole] = useState<string | null>(null)
  const [leagueName, setLeagueName] = useState<string | null>(null)
  const [isLeagueAdmin, setIsLeagueAdmin] = useState(false)
  const [weekCount, setWeekCount] = useState<number | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const showNav = pathname !== '/sign-in' && pathname !== '/reset-password'

  useEffect(() => {
    setSheetOpen(false)
  }, [pathname])

  useEffect(() => {
    if (pathname === '/sign-in' || pathname === '/reset-password') return
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => res.json().catch(() => ({})))
      .then(async (data) => {
        setUser(data?.user ?? null)
        setDisplayName(data?.profile?.display_name ?? data?.user?.email ?? null)
        if (data?.user?.id) {
          const { createClient } = await import('@/lib/supabase/client')
          const supabase = createClient()
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', data.user.id)
            .maybeSingle()
          setProfileRole(profile?.role ?? null)
        }
      })
  }, [pathname])

  useEffect(() => {
    if (!leagueId) {
      setLeagueName(null)
      setIsLeagueAdmin(false)
      setWeekCount(null)
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
    fetchWeeks(leagueId)
      .then((weeks) => setWeekCount(weeks.length))
      .catch(() => setWeekCount(null))
  }, [leagueId])

  async function handleSignOut() {
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })
    window.location.href = '/sign-in'
  }

  const resolvedMenu = menu.length > 0 ? menu : (() => {
    const items: MenuItem[] = [
      ...(leagueId
        ? [
            { title: 'Results', url: `/${leagueId}/results` },
            { title: 'Players', url: `/${leagueId}/players` },
            ...(isLeagueAdmin ? [{ title: 'Settings', url: `/${leagueId}/settings` }] : []),
          ]
        : []),
    ]
    return items
  })()

  const isSettingsPage = pathname === '/settings' || !!pathname?.match(/^\/[^/]+\/settings$/)
  const settingsUrl = leagueId ? `/${leagueId}/settings` : '/settings'
  const isActive = (item: MenuItem) => {
    if (item.title === 'Results') return !!leagueId && !isPlayersPage && !isSettingsPage
    if (item.title === 'Players') return isPlayersPage
    if (item.title === 'Settings') return isSettingsPage
    return false
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-700 bg-slate-900">
      {/* Action bar — desktop: 3-column grid to centre nav tabs */}
      <div className="hidden sm:grid grid-cols-3 h-14 w-full max-w-2xl mx-auto items-center px-4 sm:px-6">
        {/* Left: logo */}
        <Link href={logo.url} className="flex items-center shrink-0">
          <img src="/logo.png" alt="Crafted Football" className="h-10 w-10" />
        </Link>

        {/* Centre: nav tabs */}
        <div className="flex items-center justify-center gap-6">
          {showNav && resolvedMenu.filter((item) => item.title !== 'Settings').map((item) => (
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
        </div>

        {/* Right: auth / user controls */}
        <div className="flex items-center justify-end">
          {showNav && !user && (
            <AuthDialog redirect={leagueId ? `/${leagueId}/results` : '/'} size="sm" />
          )}
          {showNav && user && (
            <div className="flex items-center gap-0.5">
              {profileRole === 'developer' && (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/experiments" title="Experiments">
                    <FlaskConical className="size-4" />
                  </Link>
                </Button>
              )}
              <Button asChild variant="ghost" size="sm">
                <Link href={settingsUrl}>
                  <Settings className="size-4" />
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <User className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <div className="px-2 py-1.5">
                    {displayName && (
                      <p className="text-sm font-medium text-slate-100">{displayName}</p>
                    )}
                    {leagueId && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {isLeagueAdmin ? 'Admin' : 'Member'}
                      </p>
                    )}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="size-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      {/* Mobile action bar */}
      <div className="flex sm:hidden h-14 w-full items-center justify-between px-4">
          <Link href={logo.url} className="flex items-center shrink-0">
            <img src="/logo.png" alt="Crafted Football" className="h-10 w-10" />
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
                {user && (
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-2 font-semibold text-slate-100"
                  >
                    <LogOut className="size-4" />
                    Log out
                  </button>
                )}
                {!user && (
                  <div className="flex flex-col gap-3">
                    <AuthDialog redirect={leagueId ? `/${leagueId}/results` : '/'} size="default" />
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
      </div>

      {/* League context bar */}
      {leagueId && leagueName && showNav && (
        <div className="bg-slate-800/50 border-t border-slate-700">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between">
            <span className="text-xs text-slate-400">{leagueName}</span>
            <span className="text-xs text-slate-400">
              {weekCount !== null
                ? `${weekCount} of 52 weeks (${Math.round((weekCount / 52) * 100)}% complete)`
                : ''}
            </span>
          </div>
        </div>
      )}
    </header>
  )
}
