import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function getSupabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL
}
function getSupabaseAnonKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
}

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
  return host === WEBSITE_HOST || host === `www.${WEBSITE_HOST}` || host === 'localhost' || host.startsWith('localhost:')
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

  // Supabase magic link sometimes redirects to /?code= instead of /auth/callback?code= - fix it
  const code = request.nextUrl.searchParams.get('code')
  if (code && (pathname === '/' || pathname === '')) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/callback'
    return NextResponse.redirect(url)
  }

  // 1. craft-football.com + mobile → redirect to m.craft-football.com
  if (isWebsiteHost(host) && host !== 'localhost' && !host.startsWith('localhost:') && isMobile(userAgent)) {
    const url = request.nextUrl.clone()
    url.host = APP_HOST
    url.protocol = 'https'
    return NextResponse.redirect(url)
  }

  // 2. craft-football.com (desktop) → show marketing website
  if (isWebsiteHost(host) && host !== 'localhost' && !host.startsWith('localhost:')) {
    return NextResponse.rewrite(new URL('/website', request.url))
  }

  // 3. localhost + /website → rewrite (to test website locally)
  if ((host === 'localhost' || host.startsWith('localhost:')) && pathname === '/website') {
    return NextResponse.rewrite(new URL('/website', request.url))
  }

  // 4. App host or localhost: run auth, then rewrite to /app
  const isAppRequest = (isAppHost(host) || host === 'localhost' || host.startsWith('localhost:')) &&
    (pathname === '/' || pathname === '' || pathname === '/sign-in' || pathname === '/reset-password' || pathname === '/profile-required' || pathname === '/settings' || pathname === '/add-game' || pathname.startsWith('/invite') || pathname.startsWith('/league/'))

  if (isAppRequest) {
    let response = NextResponse.next({ request })
    const isSignIn = pathname === '/sign-in'
    const isResetPassword = pathname === '/reset-password'
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
        const rewritePath = (pathname === '/' || pathname === '') ? '/app' : `/app${pathname}`
        return NextResponse.rewrite(new URL(rewritePath, request.url))
      }
      // Fall through to auth check: logged-in users can access app routes without the key
      if (!isSignIn && !isResetPassword) {
        // Check auth before redirecting to locked sign-in
        const supabaseAuth = createServerClient(
          getSupabaseUrl()!,
          getSupabaseAnonKey()!,
          {
            cookies: {
              getAll: () => request.cookies.getAll(),
              setAll: () => {},
            },
          }
        )
        const { data } = await supabaseAuth.auth.getUser()
        if (data.user) {
          const rewritePath = pathname === '/' || pathname === '' ? '/app' : `/app${pathname}`
          return NextResponse.rewrite(new URL(rewritePath, request.url))
        }
        const redirectUrl = request.nextUrl.clone()
        redirectUrl.pathname = SIGN_IN_PATH
        redirectUrl.searchParams.set('locked', '1')
        return NextResponse.redirect(redirectUrl)
      }
      const rewritePath = `/app${pathname}`
      return NextResponse.rewrite(new URL(rewritePath, request.url))
    }

    const supabaseUrl = getSupabaseUrl()
    const supabaseAnonKey = getSupabaseAnonKey()
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY/PUBLISHABLE_KEY')
      return new NextResponse('Server misconfigured', { status: 503 })
    }

    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
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

    let user = null
    try {
      const { data } = await supabase.auth.getUser()
      user = data.user
    } catch (err) {
      console.error('Middleware auth error:', err)
      return new NextResponse('Auth error', { status: 503 })
    }

    if (!user && !isSignIn && !isResetPassword && !isAuthCallback) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = SIGN_IN_PATH
      redirectUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(redirectUrl)
    }

    if (user && isSignIn) {
      const redirectTo = request.nextUrl.searchParams.get('redirect') || '/'
      return NextResponse.redirect(new URL(redirectTo, request.url))
    }

    // profile-required: user exists but no profile (show sign-out + message)
    if (pathname === '/profile-required' && user) {
      return NextResponse.rewrite(new URL('/app/profile-required', request.url))
    }

    // Protected routes require profile; redirect if missing
    const isProtectedRoute = pathname !== '/reset-password' && pathname !== '/profile-required'
    if (user && isProtectedRoute) {
      const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle()
      if (!profile) {
        const redirectUrl = request.nextUrl.clone()
        redirectUrl.pathname = '/profile-required'
        return NextResponse.redirect(redirectUrl)
      }
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
