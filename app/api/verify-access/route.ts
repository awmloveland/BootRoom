import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const ACCESS_KEY_COOKIE = 'app_access'

export async function GET() {
  const key = process.env.APP_ACCESS_KEY
  if (!key) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  const cookieStore = await cookies()
  const cookieKey = cookieStore.get(ACCESS_KEY_COOKIE)?.value
  if (cookieKey === key) {
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ ok: false }, { status: 401 })
}
