import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/supabase/session'

const SIGN_IN_PATH = '/sign-in'

function getSupabaseUrl() { return process.env.NEXT_PUBLIC_SUPABASE_URL! }
function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
}

/**
 * Two routes need a session with a profiles row before they render: the
 * account page, and a league's settings page, whose server component checks
 * the admin role itself and redirects members. Everything else is public.
 * The session is verified locally from the JWT.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Forward pathname to server components via request header
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)
  const requestWithPathname = { request: { headers: requestHeaders } }

  if (pathname.startsWith('/api') || pathname.startsWith('/auth') || pathname.startsWith('/_next')) {
    return NextResponse.next(requestWithPathname)
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
  if (!isAccountSettings && !isLeagueSettings) {
    return NextResponse.next(requestWithPathname)
  }

  const response = NextResponse.next(requestWithPathname)
  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  const user = await getSessionUser(supabase)
  if (!user) {
    // Keep the query (e.g. ?tab=members) so the visitor lands where they were heading.
    const redirectUrl = new URL(SIGN_IN_PATH, request.url)
    redirectUrl.searchParams.set('redirect', pathname + request.nextUrl.search)
    return NextResponse.redirect(redirectUrl)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    return NextResponse.redirect(new URL('/profile-required', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
