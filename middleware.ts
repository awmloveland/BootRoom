import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const SIGN_IN_PATH = '/sign-in'
const AUTH_CALLBACK_PATH = '/auth/callback'
const ACCESS_KEY_COOKIE = 'app_access'
const ACCESS_KEY_DAYS = 7

const APP_HOST = 'm.craft-football.com'
const WEBSITE_HOST = 'craft-football.com'

function isAppHost(host: string | null): boolean {
  if (!host) return false
  return host === APP_HOST || host.startsWith('m.')
}

function isWebsiteHost(host: string | null): boolean {
  if (!host) return false
  return host === WEBSITE_HOST || host === 'localhost' || host.startsWith('localhost:')
}

function isMobile(userAgent: string): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
}

function hasValidAccessKey(request: NextRequest): boolean {
  const key = process.env.APP_ACCESS_KEY
  if (!key) return false
  const urlKey = request.nextUrl.searchParams.get('key')
  if (urlKey && urlKey === key) return true
  const cookieKey = request.cookies.get(ACCESS_KEY_COOKIE)?.value
  return cookieKey === key
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const pathname = request.nextUrl.pathname
  const userAgent = request.headers.get('user-agent') ?? ''

  // Skip API and auth callback - no host-based routing
  if (pathname.startsWith('/api') || pathname.startsWith('/auth')) {
    return NextResponse.next({ request })
  }

  // 1. craft-football.com + mobile → redirect to m.craft-football.com
  if (isWebsiteHost(host) && host !== 'localhost' && !host.startsWith('localhost:') && isMobile(userAgent)) {
    const url = request.nextUrl.clone()
    url.host = APP_HOST
    url.protocol = 'https'
    return NextResponse.redirect(url)
  }

  // 2. craft-football.com (desktop) + path / → rewrite to /website
  if (isWebsiteHost(host) && (pathname === '/' || pathname === '')) {
    return NextResponse.rewrite(new URL('/website', request.url))
  }

  // 3. craft-football.com + app paths (/players, /sign-in) → redirect to m
  if (isWebsiteHost(host) && host !== 'localhost' && !host.startsWith('localhost:') && (pathname === '/players' || pathname === '/sign-in')) {
    const url = request.nextUrl.clone()
    url.host = APP_HOST
    url.protocol = 'https'
    return NextResponse.redirect(url)
  }

  // 4. localhost + /website → rewrite (to test website locally)
  if ((host === 'localhost' || host.startsWith('localhost:')) && pathname === '/website') {
    return NextResponse.rewrite(new URL('/website', request.url))
  }

  // 5. App host or localhost: run auth, then rewrite to /app
  const isAppRequest = (isAppHost(host) || host === 'localhost' || host.startsWith('localhost:')) &&
    (pathname === '/' || pathname === '' || pathname === '/players' || pathname === '/sign-in')

  if (isAppRequest) {
    let response = NextResponse.next({ request })
    const isSignIn = pathname === '/sign-in'
    const isAuthCallback = pathname.startsWith(AUTH_CALLBACK_PATH)

    // Access key only required on production (m.craft-football.com), not localhost
    const isProductionApp = isAppHost(host)
    const accessKey = process.env.APP_ACCESS_KEY
    if (isProductionApp && accessKey) {
      const urlKey = request.nextUrl.searchParams.get('key')
      if (urlKey && urlKey === accessKey) {
        response.cookies.set(ACCESS_KEY_COOKIE, accessKey, {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * ACCESS_KEY_DAYS,
          path: '/',
        })
        const redirectUrl = request.nextUrl.clone()
        redirectUrl.searchParams.delete('key')
        return NextResponse.redirect(redirectUrl)
      }
      if (hasValidAccessKey(request)) {
        const rewritePath = pathname === '/' || pathname === '' ? '/app' : `/app${pathname}`
        return NextResponse.rewrite(new URL(rewritePath, request.url))
      }
      if (!isSignIn) {
        const redirectUrl = request.nextUrl.clone()
        redirectUrl.pathname = SIGN_IN_PATH
        redirectUrl.searchParams.set('locked', '1')
        return NextResponse.redirect(redirectUrl)
      }
      const rewritePath = `/app${pathname}`
      return NextResponse.rewrite(new URL(rewritePath, request.url))
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user && !isSignIn && !isAuthCallback) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = SIGN_IN_PATH
      redirectUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(redirectUrl)
    }

    if (user && isSignIn) {
      const redirectTo = request.nextUrl.searchParams.get('redirect') || '/'
      return NextResponse.redirect(new URL(redirectTo, request.url))
    }

    const rewritePath = pathname === '/' || pathname === '' ? '/app' : `/app${pathname}`
    return NextResponse.rewrite(new URL(rewritePath, request.url))
  }

  return NextResponse.next({ request })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
