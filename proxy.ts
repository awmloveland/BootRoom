import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const SIGN_IN_PATH = '/sign-in'

// Routes that require a valid Supabase session
const AUTH_REQUIRED = ['/settings', '/welcome']

// Routes that require profiles.role = 'developer'
const DEVELOPER_REQUIRED = ['/experiments']

function getSupabaseUrl() { return process.env.NEXT_PUBLIC_SUPABASE_URL! }
function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Forward pathname to server components via request header
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)
  const requestWithPathname = { request: { headers: requestHeaders } }

  // Skip static assets, API routes, and auth callback
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/_next')
  ) {
    return NextResponse.next(requestWithPathname)
  }

  // Fix Supabase magic link: /?code= → /auth/callback?code=
  const code = request.nextUrl.searchParams.get('code')
  if (code && (pathname === '/' || pathname === '')) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/callback'
    return NextResponse.redirect(url)
  }

  // Check if this path needs auth or developer role
  const needsAuth = AUTH_REQUIRED.some((p) => pathname === p || pathname.startsWith(p + '/'))
  const needsDeveloper = DEVELOPER_REQUIRED.some((p) => pathname === p || pathname.startsWith(p + '/'))
  const needsLeagueAdmin = /^\/[^/]+\/settings(\/|$)/.test(pathname)

  if (!needsAuth && !needsDeveloper && !needsLeagueAdmin) {
    return NextResponse.next(requestWithPathname)
  }

  // Build supabase client to check session
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

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = SIGN_IN_PATH
    redirectUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Check profile exists (required for all auth-gated routes)
  // Skip for /sign-in, /profile-required, /invite which handle this themselves
  const skipProfileCheck = ['/sign-in', '/profile-required', '/invite'].some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )
  if (!skipProfileCheck) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/profile-required'
      return NextResponse.redirect(redirectUrl)
    }
  }

  if (needsDeveloper) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.role !== 'developer') {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  if (needsLeagueAdmin) {
    // Extract slug from path like /the-boot-room/settings, resolve to UUID
    const slug = pathname.split('/')[1]
    const { data: game } = await supabase
      .from('games')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (!game) {
      return NextResponse.redirect(new URL(`/${slug}/results`, request.url))
    }

    const { data: member } = await supabase
      .from('game_members')
      .select('role')
      .eq('game_id', game.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!member || !['creator', 'admin'].includes(member.role)) {
      return NextResponse.redirect(new URL(`/${slug}/results`, request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
