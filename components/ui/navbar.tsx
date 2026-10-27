'use client'

import type { ReactElement } from 'react'
import Link from 'next/link'
import { usePathname, useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Settings, LogOut, Plus } from 'lucide-react'

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
import type { NavSession } from '@/lib/types'

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
  /** The viewer, resolved on the server. Null when signed out. */
  session: NavSession | null
  /** True while the server is still resolving the session (Suspense fallback). */
  pending?: boolean
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
  session,
  pending = false,
}: NavbarProps) {
  const pathname = usePathname()
  const params = useParams()
  const slug = (params as { slug?: string })?.slug
  const isPlayersPage = !!pathname?.match(/^\/[^/]+\/players$/)

  const [sheetOpen, setSheetOpen] = useState(false)
  const router = useRouter()

  const user = session
  const displayName = session?.displayName ?? null
  const currentRole = slug ? session?.leagues.find((l) => l.slug === slug)?.role : undefined
  const isLeagueAdmin = currentRole === 'creator' || currentRole === 'admin'

  const showNav = pathname !== '/sign-in'

  // Reset sheet open state when pathname changes (React key-based reset pattern)
  const [sheetPathname, setSheetPathname] = useState(pathname)
  if (sheetPathname !== pathname) {
    setSheetPathname(pathname)
    if (sheetOpen) setSheetOpen(false)
  }

  async function handleSignOut() {
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })
    // The server cleared the session cookies; re-render the layout so the
    // navbar and every page re-resolve as signed out.
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
  // signed-out visitors (and while the server is still resolving) there.
  if (pathname === '/' && (pending || !user)) return null
  // The league setup flow at /new draws its own centred shell with no header.
  if (pathname === '/new' || pathname.startsWith('/new/')) return null

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
          {showNav && !pending && !user && (
            <AuthDialog redirect={slug ? `/${slug}` : '/'} size="xs" signinOnly />
          )}
          {showNav && user && (
            <div className="flex items-center gap-0.5">
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
          {showNav && !pending && !user && (
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
                      href="/new"
                      className="flex items-center gap-2 text-sm font-bold text-[#f4f9ff]"
                      onClick={() => setSheetOpen(false)}
                    >
                      <Plus className="size-4" />
                      Create a league
                    </Link>
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
