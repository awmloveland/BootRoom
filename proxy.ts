import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/supabase/session'

const SIGN_IN_PATH = '/sign-in'

function getSupabaseUrl() { return process.env.NEXT_PUBLIC_SUPABASE_URL! }
function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
}

/** True when the browser holds a Supabase session (possibly split across `.0`, `.1` chunks). */
function hasSessionCookie(request: NextRequest) {
  return request.cookies.getAll().some(({ name }) => name.startsWith('sb-') && name.includes('-auth-token'))
}

/** Passes the request on, with its pathname as a header for server components. */
function next(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set('x-pathname', request.nextUrl.pathname)
  return NextResponse.next({ request: { headers } })
}

/**
 * Refreshes the session for every page a signed-in visitor loads. Server
 * components cannot write cookies, so a session they refresh is lost and every
 * later request, the tab prefetches included, refreshes the same token again;
 * Supabase rejects those concurrent refreshes, and each one can stall a render
 * for up to 30 seconds. Here the refreshed session goes back to the browser and
 * on to this request's render. The session itself is verified locally from
 * the JWT.
 *
 * Three routes also need a session with a profiles row before they render:
 * the account page, the league setup flow at /new, and a league's settings
 * page, whose server component checks the admin role itself and redirects
 * members. Everything else is public.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api') || pathname.startsWith('/auth') || pathname.startsWith('/_next')) {
    return next(request)
  }

  // Fix Supabase magic link: /?code= → /auth/callback?code=
  const code = request.nextUrl.searchParams.get('code')
  if (code && (pathname === '/' || pathname === '')) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/callback'
    return NextResponse.redirect(url)
  }

  const isAccountSettings = pathname === '/settings' || pathname.startsWith('/settings/')
  const isLeagueSettings = /^\/[^/]+\/settings(\/|$)/.test(pathname)
  const isNewLeague = pathname === '/new' || pathname.startsWith('/new/')
  const needsSession = isAccountSettings || isLeagueSettings || isNewLeague
  if (!needsSession && !hasSessionCookie(request)) {
    return next(request)
  }

  let response = next(request)
  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        // Updating the request's cookies first means the render sees the new session.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = next(request)
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        // No-store headers, so a CDN never serves one visitor's session to another.
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
      },
    },
  })

  const user = await getSessionUser(supabase)
  if (!needsSession) return response

  // Redirects carry any refreshed session too, or the browser would keep the spent one.
  const redirectTo = (url: URL) => {
    const redirect = NextResponse.redirect(url)
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  if (!user) {
    // Keep the query (e.g. ?tab=members) so the visitor lands where they were heading.
    const redirectUrl = new URL(SIGN_IN_PATH, request.url)
    redirectUrl.searchParams.set('redirect', pathname + request.nextUrl.search)
    return redirectTo(redirectUrl)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    return redirectTo(new URL('/profile-required', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
