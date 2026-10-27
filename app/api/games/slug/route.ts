import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
import { resolveUniqueSlug } from '@/lib/slug'
import { generateSlug } from '@/lib/utils'

/** GET ?name= — signed-in only. The address a new league with this name would get (with -2, -3 when taken). */
export async function GET(req: Request) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const name = new URL(req.url).searchParams.get('name') ?? ''
  if (!generateSlug(name)) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  return NextResponse.json({ slug: await resolveUniqueSlug(name) })
}
