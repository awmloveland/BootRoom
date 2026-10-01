'use client'

import type { ReactElement } from 'react'
import Link from 'next/link'
import { usePathname, useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Settings, LogOut, FlaskConical } from 'lucide-react'

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
import { AvatarButton } from '@/components/ui/AvatarButton'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

interface MenuItem {
  title: string
  url: string
  description?: string
  icon?: ReactElement
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
  const slug = (params as { slug?: string })?.slug
  const isPlayersPage = !!pathname?.match(/^\/[^/]+\/players$/)

  const [user, setUser] = useState<{ id?: string; email?: string } | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [profileRole, setProfileRole] = useState<string | null>(null)
  const [isLeagueAdmin, setIsLeagueAdmin] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [authResolved, setAuthResolved] = useState(false)

  const router = useRouter()

  const fetchUserData = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      let role: string | null = null
      if (data?.user?.id) {
        const supabase = createClient()
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle()
        role = profile?.role ?? null
      }
      const first = data?.profile?.first_name ?? ''
      const last = data?.profile?.last_name ?? ''
      const derivedName = `${first} ${last}`.trim() || data?.user?.email || null
      return { user: data?.user ?? null, displayName: derivedName, role }
    } catch {
      return { user: null, displayName: null, role: null }
    }
  }, [])

  const applyUserData = useCallback((result: { user: { id?: string; email?: string } | null; displayName: string | null; role: string | null }) => {
    setUser(result.user)
    setDisplayName(result.displayName)
    setProfileRole(result.role)
  }, [])

  const showNav = pathname !== '/sign-in'

  // Reset sheet open state when pathname changes (React key-based reset pattern)
  const [sheetPathname, setSheetPathname] = useState(pathname)
  if (sheetPathname !== pathname) {
    setSheetPathname(pathname)
    if (sheetOpen) setSheetOpen(false)
  }

  useEffect(() => {
    if (pathname === '/sign-in') return
    let cancelled = false
    fetchUserData().then((result) => {
      if (cancelled) return
      applyUserData(result)
      setAuthResolved(true)
    })
    return () => { cancelled = true }
  }, [pathname, fetchUserData, applyUserData])

  // Read inside the auth listener without resubscribing on every navigation.
  const pathnameRef = useRef(pathname)
  useEffect(() => { pathnameRef.current = pathname }, [pathname])

  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION') return
      if (event === 'SIGNED_IN') {
        // Signing in from the landing page reloads straight into the app.
        // Showing the app navbar first would stack it over the landing
        // page's own header until the reload lands.
        if (pathnameRef.current === '/') return
        fetchUserData().then(applyUserData)
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setDisplayName(null)
        setProfileRole(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [fetchUserData, applyUserData])

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    fetch('/api/games', { credentials: 'include' })
      .then((res) => res.json().catch(() => []))
      .then((data: { id: string; slug: string; name: string; role: string }[]) => {
        if (cancelled) return
        const game = (data ?? []).find((g) => g.slug === slug)
        setIsLeagueAdmin(game?.role === 'creator' || game?.role === 'admin')
      })
      .catch(() => { if (!cancelled) setIsLeagueAdmin(false) })
    return () => { cancelled = true }
  }, [slug])

  // Reset league admin when leaving a league context (state-comparison during render)
  const [prevSlug, setPrevSlug] = useState(slug)
  if (prevSlug !== slug) {
    setPrevSlug(slug)
    if (!slug) setIsLeagueAdmin(false)
  }

  async function handleSignOut() {
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })
    const supabase = createClient()
    await supabase.auth.signOut()
    router.refresh()
  }

  const resolvedMenu: MenuItem[] = menu.length > 0 ? menu : []

  const isSettingsPage = pathname === '/settings' || !!pathname?.match(/^\/[^/]+\/settings$/)
  const isActive = (item: MenuItem) => {
    if (item.title === 'Results') return !!slug && !isPlayersPage && !isSettingsPage
    if (item.title === 'Players') return isPlayersPage
    if (item.title === 'Settings') return isSettingsPage
    return false
  }

  // The landing page at / ships its own header; hide the app navbar for
  // signed-out visitors (and while auth state is still resolving) there.
  if (pathname === '/' && (!authResolved || !user)) return null

  return (
    <header className="sticky top-0 z-50 border-b border-[#101d31] bg-[rgba(6,11,20,.92)] backdrop-blur-[10px]">
      {/* Action bar — desktop: 3-column grid to centre nav tabs */}
      <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] h-[60px] w-full max-w-[936px] mx-auto px-6 items-center">
        {/* Left: logo */}
        <Link href={logo.url} className="flex items-center gap-2.5 shrink-0 text-[#f4f9ff]">
          <img src="/logo.png" alt="Craft Football" className="block h-[30px] w-[30px]" />
          <span className="text-base font-bold tracking-[-.02em]">Craft Football</span>
        </Link>

        {/* Centre: nav tabs */}
        <div className="flex items-center justify-center gap-6">
          {showNav && resolvedMenu.filter((item) => item.title !== 'Settings').map((item) => (
            <Link
              key={item.title}
              href={item.url}
              className={cn(
                'font-plex text-[10.5px] font-bold uppercase tracking-[.14em] transition-colors',
                isActive(item) ? 'text-[#f4f9ff]' : 'text-[#8ba4c4] hover:text-[#f4f9ff]'
              )}
            >
              {item.title}
            </Link>
          ))}
        </div>

        {/* Right: auth / user controls */}
        <div className="flex items-center justify-end gap-2">
          {showNav && !user && (
            <AuthDialog redirect={slug ? `/${slug}` : '/'} size="xs" signinOnly />
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <AvatarButton name={displayName ?? ''} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <div className="px-2 py-1.5">
                    {displayName && (
                      <p className="font-inter-body text-[13px] font-semibold text-[#f4f9ff]">{displayName}</p>
                    )}
                    {slug && (
                      <p className="font-plex text-[9px] font-bold uppercase tracking-[.16em] text-[#6f88a8] mt-1">
                        {isLeagueAdmin ? 'Admin' : 'Member'}
                      </p>
                    )}
                  </div>
                  <DropdownMenuItem asChild>
                    <Link href="/settings">
                      <Settings className="size-4" />
                      Account Settings
                    </Link>
                  </DropdownMenuItem>
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
          <Link href={logo.url} className="flex items-center gap-2.5 shrink-0 text-[#f4f9ff]">
            <img src="/logo.png" alt="Craft Football" className="block h-[30px] w-[30px]" />
            <span className="text-[15px] font-bold tracking-[-.02em]">Craft Football</span>
          </Link>
          {showNav && !user && (
            <AuthDialog redirect={slug ? `/${slug}` : '/'} size="xs" signinOnly />
          )}
          {showNav && user && (
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <AvatarButton name={displayName ?? ''} />
              </SheetTrigger>
              <SheetContent className="overflow-y-auto bg-[#0a1421] border-[#1b2c46]">
                <SheetHeader>
                  <SheetTitle className="text-base font-bold tracking-[-.02em] text-[#f4f9ff]">Menu</SheetTitle>
                </SheetHeader>
                <div className="my-6 flex flex-col gap-6">
                  <Accordion
                    type="single"
                    collapsible
                    className="flex w-full flex-col gap-4"
                  >
                    {resolvedMenu.map((item) => renderMobileMenuItem(item, isActive(item)))}
                  </Accordion>
                  {mobileExtraLinks.length > 0 && (
                    <div className="border-t border-[#1b2c46] py-4">
                      <div className="grid grid-cols-2 justify-start">
                        {mobileExtraLinks.map((link, idx) => (
                          <Link
                            key={idx}
                            className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded px-4 py-2 text-sm font-medium text-[#8ba4c4] transition-colors hover:bg-[#101d31] hover:text-[#f4f9ff]"
                            href={link.url}
                          >
                            {link.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="border-t border-[#1b2c46] pt-4 flex flex-col gap-4">
                    <div>
                      {displayName && (
                        <p className="font-inter-body text-[13px] font-semibold text-[#f4f9ff]">{displayName}</p>
                      )}
                      {slug && (
                        <p className="font-plex text-[9px] font-bold uppercase tracking-[.16em] text-[#6f88a8] mt-1">
                          {isLeagueAdmin ? 'Admin' : 'Member'}
                        </p>
                      )}
                    </div>
                    <Link
                      href="/settings"
                      className="flex items-center gap-2 text-sm font-bold text-[#f4f9ff]"
                      onClick={() => setSheetOpen(false)}
                    >
                      <Settings className="size-4" />
                      Account Settings
                    </Link>
                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-2 text-sm font-bold text-[#f4f9ff]"
                    >
                      <LogOut className="size-4" />
                      Log out
                    </button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          )}
      </div>

    </header>
  )
}
